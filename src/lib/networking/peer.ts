import SimplePeer from 'simple-peer';

// Options specific to our PeerConnection class
export type PeerConnectionSpecificOptions = {
  debug?: boolean;
};

// Combined options for PeerConnection constructor
// Use Partial for the whole thing as the constructor takes Partial<PeerConnectionOptions>
export type PeerConnectionOptions = Partial<SimplePeer.Options & PeerConnectionSpecificOptions>;

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

  constructor(initiator: boolean, options: PeerConnectionOptions = {}) {
    this.debug = options.debug || false;

    // Destructure to get only SimplePeer.Options, excluding our 'debug' prop
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { debug: _, ...simplePeerSpecificOptions } = options;

    const finalSimplePeerOptions: SimplePeer.Options = {
      ...simplePeerSpecificOptions, // These are already SimplePeer.Options compatible
      initiator,
      trickle: true, // Default to trickle ICE, can be overridden by options if present in simplePeerSpecificOptions
    };

    this.peer = new SimplePeer(finalSimplePeerOptions);

    this.peer.on('signal', (data: SimplePeer.SignalData) => {
      if (this.debug) console.log('[PeerConnection] Signal generated:', data);
      this.listeners.signal?.(data);
    });

    this.peer.on('connect', () => {
      if (this.debug) console.log('[PeerConnection] Peer connected');
      this.listeners.connect?.();
    });

    this.peer.on('data', (data: Buffer) => {
      try {
        const parsedData = JSON.parse(data.toString()) as PeerData;
        if (this.debug) console.log('[PeerConnection] Received data:', parsedData);
        this.listeners.data?.(parsedData);
      } catch (error) {
        console.error('[PeerConnection] Failed to parse peer data:', error);
      }
    });

    this.peer.on('close', () => {
      if (this.debug) console.log('[PeerConnection] Peer connection closed');
      this.listeners.close?.();
    });

    this.peer.on('error', (error: Error) => {
      console.error('[PeerConnection] Peer connection error:', error);
      this.listeners.error?.(error);
    });
  }

  // Send data to the peer
  send(type: string, payload: unknown): void {
    if (!this.peer.connected) {
      console.warn('[PeerConnection] Cannot send data: peer not connected');
      return;
    }

    try {
      const data: PeerData = { type, payload };
      const jsonData = JSON.stringify(data);
      if (this.debug) console.log(`[PeerConnection] Sending data: ${jsonData}`);
      this.peer.send(jsonData);
    } catch (error) {
      console.error('[PeerConnection] Failed to send data:', error);
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
    if (this.debug) console.log('[PeerConnection] Closing connection...');
    this.peer.destroy();
  }

  // Check if we're connected
  get isConnected(): boolean {
    return this.peer.connected;
  }
}
