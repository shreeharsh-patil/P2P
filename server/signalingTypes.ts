export type SignalType = 
  | 'CREATE_SESSION'
  | 'SESSION_CREATED'
  | 'JOIN_SESSION'
  | 'SESSION_JOINED'
  | 'PEER_JOINED'
  | 'PEER_LEFT'
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
  payload?: any;
  error?: string;
}

export interface PeerSession {
  sessionId: string;
  hostPeerId: string;
  clientPeerId?: string;
  createdAt: number;
}
