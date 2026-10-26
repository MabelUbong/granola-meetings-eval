import https from 'https';

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type JsonSchemaResponseFormat = {
  name: string;
  description?: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

type CallOpenAIOptions = {
  temperature?: number;
  jsonSchema?: JsonSchemaResponseFormat;
};

type EmbeddingsResponse = {
  data?: Array<{
    embedding: number[];
    index: number;
  }>;
  error?: {
    message?: string;
  };
};

function postJson<T>(url: string, apiKey: string, body: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const request = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try {
            const json = JSON.parse(text) as T & {error?: {message?: string}};
            if (response.statusCode && response.statusCode >= 400) {
              reject(new Error(json.error?.message || `OpenAI HTTP ${response.statusCode}`));
              return;
            }
            resolve(json);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function extractText(response: OpenAIResponse): string {
  if (response.output_text) {
    return response.output_text;
  }

  const outputText = response.output
    ?.flatMap(item => item.content || [])
    .map(item => item.text || '')
    .filter(Boolean)
    .join('\n');
  if (outputText) {
    return outputText;
  }

  return response.choices?.[0]?.message?.content || '';
}

function requireText(response: OpenAIResponse): string {
  const text = extractText(response);
  if (!text) {
    throw new Error('OpenAI response did not include text output');
  }
  return text;
}

function maybeAddTemperature(body: Record<string, unknown>, options: CallOpenAIOptions): void {
  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }
}

export async function callOpenAI(model: string, input: string, options: CallOpenAIOptions = {}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  try {
    const responsesBody: Record<string, unknown> = {
      model,
      input,
    };
    maybeAddTemperature(responsesBody, options);
    if (options.jsonSchema) {
      responsesBody.text = {
        format: {
          type: 'json_schema',
          name: options.jsonSchema.name,
          description: options.jsonSchema.description,
          schema: options.jsonSchema.schema,
          strict: options.jsonSchema.strict ?? true,
        },
      };
    }
    const response = await postJson<OpenAIResponse>('https://api.openai.com/v1/responses', apiKey, responsesBody);
    return requireText(response);
  } catch (responsesError) {
    const chatBody: Record<string, unknown> = {
      model,
      messages: [{role: 'user', content: input}],
    };
    maybeAddTemperature(chatBody, options);
    if (options.jsonSchema) {
      chatBody.response_format = {
        type: 'json_schema',
        json_schema: {
          name: options.jsonSchema.name,
          description: options.jsonSchema.description,
          schema: options.jsonSchema.schema,
          strict: options.jsonSchema.strict ?? true,
        },
      };
    }

    try {
      const response = await postJson<OpenAIResponse>('https://api.openai.com/v1/chat/completions', apiKey, chatBody);
      return requireText(response);
    } catch (chatError) {
      throw new Error(
        `OpenAI Responses API failed: ${errorMessage(
          responsesError,
        )}; Chat Completions fallback failed: ${errorMessage(chatError)}`,
      );
    }
  }
}

export async function callOpenAIEmbeddings(inputs: string[], model: string): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  if (inputs.length === 0) {
    return [];
  }

  const response = await postJson<EmbeddingsResponse>('https://api.openai.com/v1/embeddings', apiKey, {
    model,
    input: inputs,
  });

  const data = response.data || [];
  return data
    .sort((a, b) => a.index - b.index)
    .map(item => item.embedding);
}
