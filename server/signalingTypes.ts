export type SignalType = 
  | 'CREATE_SESSION'
  | 'SESSION_CREATED'
  | 'JOIN_SESSION'
  | 'SESSION_JOINED'
  | 'RESUME_SESSION'
  | 'SESSION_RESUMED'
  | 'LEAVE_SESSION'
  | 'PEER_JOINED'
  | 'PEER_LEFT'
  | 'PEER_PAUSED'
  | 'PEER_READY'
  | 'SIGNAL'
  | 'ERROR'
  | 'PING'
  | 'PONG'
  | 'WELCOME';

export interface SignalMessage {
  type: SignalType;
  sessionId?: string;
  peerId?: string;
  targetPeerId?: string;
  resumeToken?: string;
  isHost?: boolean;
  payload?: any;
  error?: string;
}

export interface PeerSession {
  sessionId: string;
  hostPeerId: string;
  clientPeerId?: string;
  createdAt: number;
}
