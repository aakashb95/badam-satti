import { SoundGenerator } from './SoundGenerator';

export interface GameSounds {
  gameStart: string;
  gameEnd: string;
  cardPlayed: string;
  passTurn: string;
  warning: string;
  sure: string;
}

export class AudioManager {
  private static instance: AudioManager;
  private audioContext: AudioContext | null = null;
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private soundGenerator: SoundGenerator | null = null;
  private isMuted = false;
  private volume = 0.7;
  private useFallbackSounds = true;

  private soundPaths: GameSounds = {
    gameStart: '/sounds/game-start.mp3',
    gameEnd: '/sounds/game-end.mp3',
    cardPlayed: '/sounds/card-played.mp3',
    passTurn: '/sounds/pass-turn.mp3',
    warning: '/sounds/warning.mp3',
    sure: '/sounds/sure.mp3',
  };

  private constructor() {
    this.initializeAudioContext();
    this.loadSounds();
    
    // Initialize fallback sound generator
    try {
      this.soundGenerator = new SoundGenerator();
    } catch (error) {
      console.warn('Failed to initialize sound generator:', error);
    }
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private initializeAudioContext(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
    }
  }

  private loadSounds(): void {
    Object.entries(this.soundPaths).forEach(([key, path]) => {
      const audio = new Audio(path);
      audio.preload = 'auto';
      audio.volume = this.volume;
      
      audio.addEventListener('canplaythrough', () => {
        console.log(`Sound loaded: ${key}`);
      });
      
      audio.addEventListener('error', (e) => {
        console.warn(`Failed to load sound: ${key}`, e);
      });
      
      this.sounds.set(key, audio);
    });
  }

  public async playSound(soundKey: keyof GameSounds): Promise<void> {
    if (this.isMuted) return;

    const audio = this.sounds.get(soundKey);
    
    // Try to play the audio file first
    if (audio && !this.useFallbackSounds) {
      try {
        // Reset audio to beginning
        audio.currentTime = 0;
        audio.volume = this.volume;
        
        // Resume audio context if suspended (required for some browsers)
        if (this.audioContext && this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
        
        await audio.play();
        return;
      } catch (error) {
        console.warn(`Failed to play sound file: ${soundKey}, falling back to generated sound`, error);
      }
    }

    // Use fallback sound generator
    if (this.soundGenerator) {
      try {
        switch (soundKey) {
          case 'gameStart':
            await this.soundGenerator.playGameStart();
            break;
          case 'gameEnd':
            await this.soundGenerator.playGameEnd();
            break;
          case 'cardPlayed':
            await this.soundGenerator.playCardPlayed();
            break;
          case 'passTurn':
            await this.soundGenerator.playPassTurn();
            break;
          case 'warning':
            await this.soundGenerator.playWarning();
            break;
          case 'sure':
            await this.soundGenerator.playSure();
            break;
        }
      } catch (error) {
        console.warn(`Failed to play generated sound: ${soundKey}`, error);
      }
    }
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.sounds.forEach(audio => {
      audio.volume = this.volume;
    });
  }

  public getVolume(): number {
    return this.volume;
  }

  public mute(): void {
    this.isMuted = true;
  }

  public unmute(): void {
    this.isMuted = false;
  }

  public isMutedState(): boolean {
    return this.isMuted;
  }

  public toggleMute(): void {
    this.isMuted = !this.isMuted;
  }

  public setUseFallbackSounds(useFallback: boolean): void {
    this.useFallbackSounds = useFallback;
  }

  public isUsingFallbackSounds(): boolean {
    return this.useFallbackSounds;
  }

  // Convenience methods for specific game events
  public playGameStart(): void {
    this.playSound('gameStart');
  }

  public playGameEnd(): void {
    this.playSound('gameEnd');
  }

  public playCardPlayed(): void {
    this.playSound('cardPlayed');
  }

  public playPassTurn(): void {
    this.playSound('passTurn');
  }

  public playWarning(): void {
    this.playSound('warning');
  }

  public playSure(): void {
    this.playSound('sure');
  }
}

// Export singleton instance
export const audioManager = AudioManager.getInstance();