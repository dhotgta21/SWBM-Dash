declare module 'speak-tts' {
  type Listener = () => void
  type ErrorListener = (event: unknown) => void

  export default class Speech {
    constructor()
    hasBrowserSupport(): boolean
    init(conf: {
      lang?: string
      rate?: number
      pitch?: number
      volume?: number
      splitSentences?: boolean
      listeners?: {
        onstart?: Listener
        onend?: Listener
        onerror?: ErrorListener
        onvoiceschanged?: (voices: SpeechSynthesisVoice[]) => void
      }
    }): Promise<{
      voices: SpeechSynthesisVoice[]
      lang?: string
      voice?: SpeechSynthesisVoice
      volume: number
      rate: number
      pitch: number
      splitSentences: boolean
      browserSupport: boolean
    }>
    speak(data: {
      text: string
      queue?: boolean
      listeners?: {
        onstart?: Listener
        onend?: Listener
        onerror?: ErrorListener
      }
    }): Promise<unknown>
    pause(): void
    resume(): void
    cancel(): void
    pending(): boolean
    paused(): boolean
    speaking(): boolean
    setLanguage(lang: string): void
    setVoice(voice: string | SpeechSynthesisVoice): void
    setVolume(volume: number): void
    setRate(rate: number): void
    setPitch(pitch: number): void
    setSplitSentences(splitSentences: boolean): void
  }
}
