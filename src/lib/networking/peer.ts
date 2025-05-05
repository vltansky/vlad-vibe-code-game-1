import SimplePeer from 'simple-peer';

export type PeerOptions = SimplePeer.Options & {
  debug?: boolean;
};

export type PeerData = {
  type: string;
  payload: unknown;
};

export type PeerEvents = {
  connect: () => void;
  data: (data: PeerData) => void;
  close: () => void;
  error: (error: Error) => void;
  signal: (signal: SimplePeer.SignalData) => void;
};

export class PeerConnection {
  private peer: SimplePeer.Instance;
  private listeners: Partial<PeerEvents> = {};
  private debug: boolean;

  constructor(initiator: boolean, options: PeerOptions = {}) {
    this.debug = options.debug || false;
    const peerOptions: SimplePeer.Options = {
      ...options,
      initiator,
      trickle: true,
    };

    this.peer = new SimplePeer(peerOptions);

    // Set up default listeners
    this.peer.on('signal', (data: SimplePeer.SignalData) => {
      if (this.debug) console.log('Signal generated:', data);
      this.listeners.signal?.(data);
    });

    this.peer.on('connect', () => {
      if (this.debug) console.log('Peer connected');
      this.listeners.connect?.();
    });

    this.peer.on('data', (data: Buffer) => {
      try {
        const parsedData = JSON.parse(data.toString()) as PeerData;
        if (this.debug) console.log('Received data:', parsedData);
        this.listeners.data?.(parsedData);
      } catch (error) {
        console.error('Failed to parse peer data:', error);
      }
    });

    this.peer.on('close', () => {
      if (this.debug) console.log('Peer connection closed');
      this.listeners.close?.();
    });

    this.peer.on('error', (error: Error) => {
      console.error('Peer connection error:', error);
      this.listeners.error?.(error);
    });
  }

  // Send data to the peer
  send(type: string, payload: unknown): void {
    if (!this.peer.connected) {
      console.warn('Cannot send data: peer not connected');
      return;
    }

    try {
      const data: PeerData = { type, payload };
      this.peer.send(JSON.stringify(data));
    } catch (error) {
      console.error('Failed to send data:', error);
    }
  }

  // Process a signal from the remote peer
  signal(signal: SimplePeer.SignalData): void {
    this.peer.signal(signal);
  }

  // Register event listeners
  on<K extends keyof PeerEvents>(event: K, callback: PeerEvents[K]): void {
    this.listeners[event] = callback;
  }

  // Unregister event listeners
  off<K extends keyof PeerEvents>(event: K): void {
    delete this.listeners[event];
  }

  // Close the connection
  close(): void {
    this.peer.destroy();
  }

  // Check if we're connected
  get isConnected(): boolean {
    return this.peer.connected;
  }
}
