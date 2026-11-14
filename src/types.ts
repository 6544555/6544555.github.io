export type IsoDate = string
export type IsoDateTime = string
export type Uuid = string

export interface AuthUser {
  id: Uuid
  email: string
}

export type AuthReason =
  | 'INVALID_CREDENTIALS'
  | 'AUTH_REQUIRED'
  | 'CLOUD_TIMEOUT'
  | 'CLOUD_UNAVAILABLE'
  | 'CLIENT_OFFLINE'

export type AuthState =
  | { status: 'LOADING' }
  | { status: 'SIGNED_OUT'; reason?: AuthReason }
  | { status: 'AUTHENTICATED'; user: AuthUser }
  | { status: 'DEGRADED'; reason: AuthReason }

export interface SiteInfo {
  herName: string
  startDate: IsoDate
  openingLine: string
  passHint: string
}

export interface PhotoItem {
  id: Uuid
  filename: string
  takenAt: IsoDate
  note?: string
  /** Static images use src. Cloud images obtain a short-lived URL at runtime. */
  src?: string
  storagePath?: string
  createdAt?: IsoDateTime
}

export interface MemoryItem {
  id: Uuid
  date: IsoDate
  title: string
  body: string
  photoId?: Uuid
  createdAt?: IsoDateTime
}

export interface MessageItem {
  id: Uuid
  text: string
  createdAt?: IsoDateTime
}

export interface ContentBundle {
  site: SiteInfo
  photos: PhotoItem[]
  timeline: MemoryItem[]
  messages: MessageItem[]
  staticLoadFailed?: boolean
}

export type NewPhotoInput = {
  filename: string
  takenAt: IsoDate
  note?: string
  storagePath: string
}

export type NewMemoryInput = {
  date: IsoDate
  title: string
  body: string
  photoId?: Uuid
}

export interface ExportedPhoto {
  path: string
  filename: string
  blob: Blob
}

export interface ExportBundle {
  json: string
  photos: ExportedPhoto[]
}

export type CloudState =
  | 'LOADING'
  | 'READY'
  | 'DEGRADED'
  | 'PAUSED'
  | 'QUOTA'
  | 'OFFLINE'

export type CloudErrorState = Exclude<CloudState, 'LOADING' | 'READY'>

export type CloudErrorReason =
  | 'CLOUD_TIMEOUT'
  | 'CLOUD_UNAVAILABLE'
  | 'PERMISSION_POLICY'
  | 'CLOUD_PAUSED'
  | 'STORAGE_QUOTA'
  | 'DATABASE_QUOTA'
  | 'CLIENT_OFFLINE'

export type InputErrorReason =
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FORMAT'
  | 'INVALID_INPUT'
  | 'IMAGE_PROCESSING'

export class CloudError extends Error {
  readonly name = 'CloudError'

  constructor(
    public readonly state: CloudErrorState,
    public readonly reason: CloudErrorReason,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class InputError extends Error {
  readonly name = 'InputError'

  constructor(
    public readonly reason: InputErrorReason,
    message: string,
  ) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
