
export enum TaskStatus {
  WAITING = 'Waiting',
  RUNNING = 'Running',
  PAUSED = 'Paused',
  COMPLETED = 'Completed',
  ARCHIVED = 'Archived'
}

export enum RecurrenceType {
  NONE = 'None',
  DAILY = 'Daily',
  WEEKLY = 'Weekly',
  MONTHLY = 'Monthly'
}

export enum Priority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High'
}

// Replaces hardcoded Category enum
export interface Tag {
  id: string;
  name: string;
  color: string; // Tailwind class like 'bg-blue-500' or hex code
  description: string; // Helps AI understand context
}

export interface TimeSegment {
  id: string;
  taskId: string;
  startTime: number;
  endTime: number | null; // null means currently running
}

export interface Task {
  id: string;
  title: string;
  tagId: string; // Links to Tag.id
  status: TaskStatus;
  planTime: string; // ISO String for planned start
  recurrence: RecurrenceType;
  priority: Priority;
  
  // New Fields
  description?: string; // Private notes
  links?: string; // URL string
  reminderOffsets: number[]; // Minutes before planTime to alert (e.g. [5, 15, 30])
  lastRemindedAt?: number; // Timestamp of last alert to prevent spam

  createdAt: number;
  completedAt?: number;
  totalDuration: number; // In seconds (cached sum of segments)
}

export interface AIReminder {
  show: boolean;
  message: string;
  type: 'reminder' | 'suggestion' | 'alert' | 'undo'; // added undo type
  relatedTaskId?: string;
  nextTaskTitle?: string; // For preview
  undoData?: { tasks: Task[]; segments: TimeSegment[] };
}

export interface AnalysisResult {
  analysisText: string;
  generatedAt: number;
}

export interface AppSettings {
  apiKey?: string;
  model: string;
  timezone: string; // e.g. 'Asia/Shanghai', 'America/New_York'
  enableAutoAITagging?: boolean; // New setting
  autoBackupInterval: number; // Interval in hours (e.g. 1, 4, 12, 24)
  enableApiServer?: boolean;
  apiPort?: number;
  apiToken?: string;
}

export interface CityConfig {
  name: string;
  timezone: string;
  countryCode: string; // 2-letter ISO code for flags
}
