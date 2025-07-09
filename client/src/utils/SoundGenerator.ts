// Utility to generate simple audio tones for development/fallback
export class SoundGenerator {
  private audioContext: AudioContext;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  public generateTone(frequency: number, duration: number, volume: number = 0.3): Promise<void> {
    return new Promise((resolve) => {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration);

      oscillator.onended = () => resolve();
    });
  }

  public async playGameStart(): Promise<void> {
    // Happy ascending chord
    await this.generateTone(262, 0.2, 0.2); // C4
    await this.generateTone(330, 0.2, 0.2); // E4
    await this.generateTone(392, 0.3, 0.2); // G4
  }

  public async playGameEnd(): Promise<void> {
    // Victory fanfare
    await this.generateTone(523, 0.3, 0.3); // C5
    await this.generateTone(659, 0.3, 0.3); // E5
    await this.generateTone(784, 0.5, 0.3); // G5
  }

  public async playCardPlayed(): Promise<void> {
    // Quick snap sound
    await this.generateTone(800, 0.1, 0.2);
  }

  public async playPassTurn(): Promise<void> {
    // Soft descending tone
    await this.generateTone(400, 0.3, 0.2);
  }

  public async playWarning(): Promise<void> {
    // Alert beep
    await this.generateTone(880, 0.2, 0.3);
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.generateTone(880, 0.2, 0.3);
  }

  public async playSure(): Promise<void> {
    // Urgent alert
    await this.generateTone(1047, 0.15, 0.4); // C6
    await new Promise(resolve => setTimeout(resolve, 50));
    await this.generateTone(1047, 0.15, 0.4);
    await new Promise(resolve => setTimeout(resolve, 50));
    await this.generateTone(1047, 0.15, 0.4);
  }
}