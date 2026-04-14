import './fetch-polyfill'

import {info, warning} from '@actions/core'
import pRetry from 'p-retry'
import {OpenAIOptions, Options} from './options'

export interface Ids {
  parentMessageId?: string
  conversationId?: string
}

interface ChatCompletionContentPart {
  text?: string
  type?: string
}

interface ChatCompletionChoice {
  message?: {
    content?: string | ChatCompletionContentPart[]
  }
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[]
}

export class Bot {
  private readonly options: Options

  private readonly apiKey: string

  private readonly apiBaseUrl: string

  private readonly systemMessage: string

  private readonly model: string

  private readonly maxModelTokens: number

  private readonly maxResponseTokens: number

  constructor(options: Options, openaiOptions: OpenAIOptions) {
    this.options = options
    this.apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || ''
    if (this.apiKey === '') {
      throw new Error(
        "Unable to initialize the OpenAI-compatible API, neither 'OPENAI_API_KEY' nor 'OPENROUTER_API_KEY' is available"
      )
    }

    const currentDate = new Date().toISOString().split('T')[0]
    this.systemMessage = `${options.systemMessage}
Current date: ${currentDate}
Knowledge cutoff: ${openaiOptions.tokenLimits.knowledgeCutOff}

IMPORTANT: Entire response must be in the language with ISO code: ${options.language}
`
    this.apiBaseUrl = normalizeChatCompletionsUrl(options.apiBaseUrl)
    this.model = openaiOptions.model
    this.maxModelTokens = openaiOptions.tokenLimits.maxTokens
    this.maxResponseTokens = openaiOptions.tokenLimits.responseTokens
  }

  chat = async (message: string, ids: Ids): Promise<[string, Ids]> => {
    let res: [string, Ids] = ['', {}]
    try {
      res = await this.chat_(message, ids)
      return res
    } catch (e: unknown) {
      warning(`Failed to chat: ${stringifyError(e)}`)
      return res
    }
  }

  private readonly chat_ = async (
    message: string,
    ids: Ids
  ): Promise<[string, Ids]> => {
    const start = Date.now()
    void ids
    if (!message) {
      return ['', {}]
    }

    const payload = {
      model: this.model,
      messages: [
        {
          role: 'system',
          content: this.systemMessage
        },
        {
          role: 'user',
          content: message
        }
      ],
      temperature: this.options.openaiModelTemperature,
      max_tokens: this.maxResponseTokens,
      stream: false
    }

    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.openaiTimeoutMS
    )

    let responseText = ''
    try {
      const response = await pRetry(
        async () => {
          const res = await fetch(this.apiBaseUrl, {
            method: 'POST',
            headers: buildHeaders(this.apiKey, this.maxModelTokens),
            body: JSON.stringify(payload),
            signal: controller.signal
          })

          if (!res.ok) {
            const body = await safeReadBody(res)
            throw new Error(
              `OpenAI-compatible API request failed with status ${res.status}: ${body}`
            )
          }

          const data = (await res.json()) as ChatCompletionResponse
          return extractResponseText(data)
        },
        {
          retries: this.options.openaiRetries
        }
      )

      responseText = response
    } finally {
      clearTimeout(timeout)
      const end = Date.now()
      info(
        `openai-compatible request completed in ${end - start} ms using model=${this.model} base_url=${this.apiBaseUrl}`
      )
    }

    if (responseText === '') {
      warning('openai-compatible response is empty')
    }

    if (responseText.startsWith('with ')) {
      responseText = responseText.substring(5)
    }
    if (this.options.debug) {
      info(`openai-compatible response: ${responseText}`)
    }
    return [responseText, {}]
  }
}

function normalizeChatCompletionsUrl(apiBaseUrl: string): string {
  const trimmed = apiBaseUrl.replace(/\/+$/, '')
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed
  }
  return `${trimmed}/chat/completions`
}

function buildHeaders(apiKey: string, maxModelTokens: number): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }

  if (maxModelTokens > 0) {
    headers['X-Max-Model-Tokens'] = `${maxModelTokens}`
  }

  if (process.env.GITHUB_REPOSITORY) {
    headers['X-Title'] = process.env.GITHUB_REPOSITORY
  }

  if (
    process.env.GITHUB_SERVER_URL &&
    process.env.GITHUB_REPOSITORY &&
    process.env.GITHUB_RUN_ID
  ) {
    headers['HTTP-Referer'] = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  }

  return headers
}

function extractResponseText(data: ChatCompletionResponse): string {
  const content = data.choices?.[0]?.message?.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map(part => part.text ?? '')
      .join('')
      .trim()
  }
  return ''
}

async function safeReadBody(res: {text: () => Promise<string>}): Promise<string> {
  try {
    return await res.text()
  } catch (e: unknown) {
    return `failed to read response body: ${stringifyError(e)}`
  }
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}, backtrace: ${error.stack}`
  }
  return String(error)
}
