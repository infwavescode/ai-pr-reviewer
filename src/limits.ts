export class TokenLimits {
  maxTokens: number
  requestTokens: number
  responseTokens: number
  knowledgeCutOff: string

  constructor(model = 'openai/gpt-5.3-codex') {
    void model
    this.knowledgeCutOff = 'provider-specific'
    // Modern frontier models typically support far larger contexts than this
    // legacy action was designed for. Use a single conservative high ceiling
    // instead of stale per-model branches.
    this.maxTokens = 160000
    this.responseTokens = 8000
    this.requestTokens = this.maxTokens - this.responseTokens - 100
  }

  string(): string {
    return `max_tokens=${this.maxTokens}, request_tokens=${this.requestTokens}, response_tokens=${this.responseTokens}`
  }
}
