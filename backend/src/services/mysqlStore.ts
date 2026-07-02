import mysql, { type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { cloneState, createSeedState } from "../domain/streetlight.js";
import type {
  AlarmLevel,
  AlarmLog,
  AlarmType,
  AppState,
  CommandName,
  CommandSource,
  ControlLog,
  Device,
  DeviceOnlineStatus,
  LampStatus,
  LightReading,
  ThresholdConfig
} from "../domain/types.js";
import type { StateStore, StateUpdater } from "./store.js";

const HISTORY_LIMIT = 240;
const TABLES = ["control_logs", "alarm_logs", "light_readings", "threshold_configs", "devices"] as const;

type DbClient = Pool | PoolConnection;

interface MysqlStoreOptions {
  databaseUrl: string;
  tablePrefix?: string;
}

interface DeviceRow extends RowDataPacket {
  id: string;
  name: string;
  location: string;
  online_status: DeviceOnlineStatus;
  lamp_status: LampStatus;
  auto_mode: 0 | 1;
  last_heartbeat_at: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
}

interface ReadingRow extends RowDataPacket {
  id: string;
  device_id: string;
  light_intensity: number;
  lamp_status: LampStatus;
  reported_at: string | Date;
}

interface ThresholdRow extends RowDataPacket {
  device_id: string;
  low_threshold: number;
  high_threshold: number;
  enabled: 0 | 1;
  updated_at: string | Date;
}

interface AlarmRow extends RowDataPacket {
  id: string;
  device_id: string;
  alarm_type: AlarmType;
  alarm_level: AlarmLevel;
  alarm_content: string;
  handled: 0 | 1;
  created_at: string | Date;
}

interface ControlRow extends RowDataPacket {
  id: string;
  device_id: string;
  command: CommandName;
  source: CommandSource;
  result: ControlLog["result"];
  created_at: string | Date;
}

export class MysqlStateStore implements StateStore {
  readonly driver = "mysql";
  private readonly pool: Pool;
  private readonly tablePrefix: string;
  private initialized = false;
  private updateQueue = Promise.resolve();

  constructor(options: MysqlStoreOptions) {
    this.tablePrefix = sanitizePrefix(options.tablePrefix ?? "");
    this.pool = mysql.createPool({
      uri: options.databaseUrl,
      connectionLimit: 6,
      dateStrings: true,
      timezone: "Z"
    });
  }

  async init(): Promise<void> {
    await this.createSchema(this.pool);
    await this.seedIfEmpty();
    this.initialized = true;
  }

  async getState(): Promise<AppState> {
    await this.ensureInitialized();
    return this.readState(this.pool);
  }

  async update(updater: StateUpdater): Promise<AppState> {
    const runUpdate = async (): Promise<AppState> => {
      await this.ensureInitialized();
      const connection = await this.pool.getConnection();
      try {
        await connection.beginTransaction();
        const current = await this.readState(connection);
        const next = normalizeState(await updater(cloneState(current)));
        await this.writeState(connection, next);
        await connection.commit();
        return cloneState(next);
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    };

    const result = this.updateQueue.then(runUpdate, runUpdate);
    this.updateQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async dropSchema(): Promise<void> {
    for (const table of TABLES) {
      await this.pool.query(`DROP TABLE IF EXISTS ${this.table(table)}`);
    }
    this.initialized = false;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private async createSchema(client: DbClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${this.table("devices")} (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255) NOT NULL,
        online_status ENUM('ONLINE', 'OFFLINE') NOT NULL,
        lamp_status ENUM('ON', 'OFF') NOT NULL,
        auto_mode TINYINT(1) NOT NULL DEFAULT 1,
        last_heartbeat_at DATETIME(3) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        INDEX idx_devices_online_status (online_status),
        INDEX idx_devices_updated_at (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${this.table("threshold_configs")} (
        device_id VARCHAR(64) PRIMARY KEY,
        low_threshold INT NOT NULL,
        high_threshold INT NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        updated_at DATETIME(3) NOT NULL,
        CONSTRAINT ${this.constraint("threshold_device_fk")}
          FOREIGN KEY (device_id) REFERENCES ${this.table("devices")} (id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${this.table("light_readings")} (
        id VARCHAR(80) PRIMARY KEY,
        device_id VARCHAR(64) NOT NULL,
        light_intensity INT NOT NULL,
        lamp_status ENUM('ON', 'OFF') NOT NULL,
        reported_at DATETIME(3) NOT NULL,
        INDEX idx_readings_device_time (device_id, reported_at),
        INDEX idx_readings_reported_at (reported_at),
        CONSTRAINT ${this.constraint("reading_device_fk")}
          FOREIGN KEY (device_id) REFERENCES ${this.table("devices")} (id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${this.table("alarm_logs")} (
        id VARCHAR(80) PRIMARY KEY,
        device_id VARCHAR(64) NOT NULL,
        alarm_type VARCHAR(64) NOT NULL,
        alarm_level VARCHAR(32) NOT NULL,
        alarm_content TEXT NOT NULL,
        handled TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL,
        INDEX idx_alarms_device_time (device_id, created_at),
        INDEX idx_alarms_handled (handled),
        CONSTRAINT ${this.constraint("alarm_device_fk")}
          FOREIGN KEY (device_id) REFERENCES ${this.table("devices")} (id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${this.table("control_logs")} (
        id VARCHAR(96) PRIMARY KEY,
        device_id VARCHAR(64) NOT NULL,
        command VARCHAR(32) NOT NULL,
        source VARCHAR(32) NOT NULL,
        result VARCHAR(32) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        INDEX idx_control_device_time (device_id, created_at),
        CONSTRAINT ${this.constraint("control_device_fk")}
          FOREIGN KEY (device_id) REFERENCES ${this.table("devices")} (id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  private async seedIfEmpty(): Promise<void> {
    const [rows] = await this.pool.query<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) AS total FROM ${this.table("devices")}`
    );
    if (Number(rows[0]?.total ?? 0) > 0) {
      return;
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.writeState(connection, createSeedState());
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private async readState(client: DbClient): Promise<AppState> {
    const [deviceRows] = await client.query<DeviceRow[]>(
      `SELECT * FROM ${this.table("devices")} ORDER BY id ASC`
    );
    const [readingRows] = await client.query<ReadingRow[]>(
      `SELECT * FROM ${this.table("light_readings")} ORDER BY reported_at ASC, id ASC`
    );
    const [thresholdRows] = await client.query<ThresholdRow[]>(
      `SELECT * FROM ${this.table("threshold_configs")} ORDER BY device_id ASC`
    );
    const [alarmRows] = await client.query<AlarmRow[]>(
      `SELECT * FROM ${this.table("alarm_logs")} ORDER BY created_at DESC, id DESC`
    );
    const [controlRows] = await client.query<ControlRow[]>(
      `SELECT * FROM ${this.table("control_logs")} ORDER BY created_at DESC, id DESC`
    );

    return {
      devices: deviceRows.map(mapDevice),
      readings: readingRows.map(mapReading),
      thresholds: thresholdRows.map(mapThreshold),
      alarms: alarmRows.map(mapAlarm),
      controlLogs: controlRows.map(mapControl)
    };
  }

  private async writeState(client: DbClient, state: AppState): Promise<void> {
    const normalized = normalizeState(state);
    for (const table of TABLES) {
      await client.query(`DELETE FROM ${this.table(table)}`);
    }

    for (const device of normalized.devices) {
      await client.execute(
        `
          INSERT INTO ${this.table("devices")}
            (id, name, location, online_status, lamp_status, auto_mode, last_heartbeat_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          device.id,
          device.name,
          device.location,
          device.onlineStatus,
          device.lampStatus,
          device.autoMode ? 1 : 0,
          toMysqlDateTime(device.lastHeartbeatAt),
          toMysqlDateTime(device.createdAt),
          toMysqlDateTime(device.updatedAt)
        ]
      );
    }

    for (const threshold of normalized.thresholds) {
      await client.execute(
        `
          INSERT INTO ${this.table("threshold_configs")}
            (device_id, low_threshold, high_threshold, enabled, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          threshold.deviceId,
          threshold.lowThreshold,
          threshold.highThreshold,
          threshold.enabled ? 1 : 0,
          toMysqlDateTime(threshold.updatedAt)
        ]
      );
    }

    for (const reading of normalized.readings) {
      await client.execute(
        `
          INSERT INTO ${this.table("light_readings")}
            (id, device_id, light_intensity, lamp_status, reported_at)
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          reading.id,
          reading.deviceId,
          reading.lightIntensity,
          reading.lampStatus,
          toMysqlDateTime(reading.reportedAt)
        ]
      );
    }

    for (const alarm of normalized.alarms) {
      await client.execute(
        `
          INSERT INTO ${this.table("alarm_logs")}
            (id, device_id, alarm_type, alarm_level, alarm_content, handled, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          alarm.id,
          alarm.deviceId,
          alarm.alarmType,
          alarm.alarmLevel,
          alarm.alarmContent,
          alarm.handled ? 1 : 0,
          toMysqlDateTime(alarm.createdAt)
        ]
      );
    }

    for (const controlLog of normalized.controlLogs) {
      await client.execute(
        `
          INSERT INTO ${this.table("control_logs")}
            (id, device_id, command, source, result, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          controlLog.id,
          controlLog.deviceId,
          controlLog.command,
          controlLog.source,
          controlLog.result,
          toMysqlDateTime(controlLog.createdAt)
        ]
      );
    }
  }

  private table(name: (typeof TABLES)[number]): string {
    return `\`${this.tablePrefix}${name}\``;
  }

  private constraint(name: string): string {
    return `\`${this.tablePrefix}${name}\``;
  }
}

function normalizeState(state: AppState): AppState {
  const next = cloneState(state);
  next.readings = next.readings
    .sort((a, b) => a.reportedAt.localeCompare(b.reportedAt))
    .slice(-HISTORY_LIMIT);
  return next;
}

function mapDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    onlineStatus: row.online_status,
    lampStatus: row.lamp_status,
    autoMode: Boolean(row.auto_mode),
    lastHeartbeatAt: fromMysqlDateTime(row.last_heartbeat_at),
    createdAt: fromMysqlDateTime(row.created_at),
    updatedAt: fromMysqlDateTime(row.updated_at)
  };
}

function mapReading(row: ReadingRow): LightReading {
  return {
    id: row.id,
    deviceId: row.device_id,
    lightIntensity: row.light_intensity,
    lampStatus: row.lamp_status,
    reportedAt: fromMysqlDateTime(row.reported_at)
  };
}

function mapThreshold(row: ThresholdRow): ThresholdConfig {
  return {
    deviceId: row.device_id,
    lowThreshold: row.low_threshold,
    highThreshold: row.high_threshold,
    enabled: Boolean(row.enabled),
    updatedAt: fromMysqlDateTime(row.updated_at)
  };
}

function mapAlarm(row: AlarmRow): AlarmLog {
  return {
    id: row.id,
    deviceId: row.device_id,
    alarmType: row.alarm_type,
    alarmLevel: row.alarm_level,
    alarmContent: row.alarm_content,
    handled: Boolean(row.handled),
    createdAt: fromMysqlDateTime(row.created_at)
  };
}

function mapControl(row: ControlRow): ControlLog {
  return {
    id: row.id,
    deviceId: row.device_id,
    command: row.command,
    source: row.source,
    result: row.result,
    createdAt: fromMysqlDateTime(row.created_at)
  };
}

function sanitizePrefix(prefix: string): string {
  if (!/^[A-Za-z0-9_]*$/.test(prefix)) {
    throw new Error("MySQL tablePrefix can only contain letters, numbers, and underscores");
  }
  return prefix;
}

function toMysqlDateTime(value: string): string {
  const date = new Date(value);
  const normalized = Number.isFinite(date.getTime()) ? date : new Date();
  return normalized.toISOString().slice(0, 23).replace("T", " ");
}

function fromMysqlDateTime(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value.includes("T")) {
    return value.endsWith("Z") ? value : `${value}Z`;
  }
  return `${value.replace(" ", "T")}Z`;
}
