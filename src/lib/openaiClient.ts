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

export async function callOpenAI(model: string, input: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  try {
    const responsesBody = {
      model,
      input,
      temperature: 0.1,
    };
    const response = await postJson<OpenAIResponse>('https://api.openai.com/v1/responses', apiKey, responsesBody);
    return extractText(response);
  } catch (responsesError) {
    const chatBody = {
      model,
      temperature: 0.1,
      messages: [{role: 'user', content: input}],
    };
    const response = await postJson<OpenAIResponse>('https://api.openai.com/v1/chat/completions', apiKey, chatBody);
    const text = extractText(response);
    if (!text) {
      throw responsesError;
    }
    return text;
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
