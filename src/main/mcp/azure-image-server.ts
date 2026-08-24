import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { writeMCPLog } from './mcp-logger.js';

type OutputFormat = 'png' | 'jpeg';
type ImageQuality = 'low' | 'medium' | 'high';

type GenerateImageArgs = {
  prompt: string;
  size?: string;
  quality?: ImageQuality;
  output_format?: OutputFormat;
  output_compression?: number;
  n?: number;
  output_dir?: string;
  filename_prefix?: string;
};

type EditImageArgs = GenerateImageArgs & {
  image_path: string;
  mask_path?: string;
};

type AzureImageResponse = {
  data?: Array<{ b64_json?: string; revised_prompt?: string }>;
  error?: { message?: string; code?: string };
};

type AzureImageConfig = {
  apiKey: string;
  generationUrl: string;
  editUrl: string;
};

const server = new Server(
  {
    name: 'azure-image-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getApiVersion(url: URL): string {
  return (
    url.searchParams.get('api-version') ||
    process.env.AZURE_OPENAI_API_VERSION?.trim() ||
    '2024-02-01'
  );
}

function replaceImageOperation(url: URL, operation: 'generations' | 'edits'): string {
  const next = new URL(url.toString());
  next.pathname = next.pathname.replace(
    /\/images\/(?:generations|edits)\/?$/,
    `/images/${operation}`
  );
  return next.toString();
}

function buildAzureImageUrls(value: string): Pick<AzureImageConfig, 'generationUrl' | 'editUrl'> {
  const trimmed = value.trim().replace(/\/+$/, '');

  try {
    const url = new URL(trimmed);

    if (/\/images\/(?:generations|edits)\/?$/.test(url.pathname)) {
      return {
        generationUrl: replaceImageOperation(url, 'generations'),
        editUrl: replaceImageOperation(url, 'edits'),
      };
    }

    const deploymentFromUrl = url.pathname.match(/\/openai\/deployments\/([^/]+)\/?$/)?.[1];
    const deployment =
      deploymentFromUrl && decodeURIComponent(deploymentFromUrl).trim()
        ? decodeURIComponent(deploymentFromUrl)
        : process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT?.trim();

    if (!deployment) {
      throw new Error(
        'AZURE_OPENAI_ENDPOINT must be a full Azure image endpoint URL, for example ' +
          'https://resource.openai.azure.com/openai/deployments/deployment/images/generations?api-version=2024-02-01'
      );
    }

    const base = `${url.origin}/openai/deployments/${encodeURIComponent(deployment)}`;
    const apiVersion = getApiVersion(url);
    return {
      generationUrl: `${base}/images/generations?api-version=${encodeURIComponent(apiVersion)}`,
      editUrl: `${base}/images/edits?api-version=${encodeURIComponent(apiVersion)}`,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('AZURE_OPENAI_ENDPOINT must be a valid Azure OpenAI image endpoint URL.');
  }
}

function getAzureConfig(): AzureImageConfig {
  const urls = buildAzureImageUrls(requireEnv('AZURE_OPENAI_ENDPOINT'));
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim() || process.env.AZURE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Missing required environment variable: AZURE_OPENAI_API_KEY or AZURE_API_KEY');
  }

  return {
    apiKey,
    ...urls,
  };
}

function getDefaultOutputDir(): string {
  return (
    process.env.IMAGE_MCP_OUTPUT_DIR?.trim() ||
    path.join(process.cwd() || os.tmpdir(), 'generated-images')
  );
}

function sanitizeFormat(value: unknown): OutputFormat {
  if (value === 'jpeg' || value === 'png') {
    return value;
  }
  return 'png';
}

function sanitizeQuality(value: unknown): ImageQuality {
  if (value === 'medium' || value === 'high' || value === 'low') {
    return value;
  }
  return 'low';
}

function sanitizeCompression(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 100;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sanitizeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.min(4, Math.round(value)));
}

function sanitizeSize(value: unknown): string {
  if (typeof value === 'string' && /^\d{3,4}x\d{3,4}$/.test(value)) {
    return value;
  }
  return '1024x1024';
}

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function resolveOutputDir(outputDir?: string): string {
  const baseDir = path.resolve(getDefaultOutputDir());
  const target = outputDir?.trim() ? path.resolve(outputDir) : baseDir;

  if (process.env.IMAGE_MCP_ALLOW_ANY_OUTPUT_DIR !== 'true') {
    const relative = path.relative(baseDir, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(
        `Output directory must be inside IMAGE_MCP_OUTPUT_DIR (${baseDir}). ` +
          'Set IMAGE_MCP_ALLOW_ANY_OUTPUT_DIR=true to allow arbitrary output directories.'
      );
    }
  }

  return target;
}

async function writeImages(
  response: AzureImageResponse,
  args: Pick<GenerateImageArgs, 'output_dir' | 'filename_prefix' | 'output_format'>,
  toolName: string
) {
  if (!Array.isArray(response.data) || response.data.length === 0) {
    throw new Error('Azure image API returned no image data.');
  }

  const format = sanitizeFormat(args.output_format);
  const outputDir = resolveOutputDir(args.output_dir);
  await fs.mkdir(outputDir, { recursive: true });

  const prefix = sanitizeFilenamePart(args.filename_prefix || toolName) || toolName;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const images: Array<{ path: string; mimeType: string; revisedPrompt?: string }> = [];

  for (const [index, item] of response.data.entries()) {
    if (!item.b64_json) {
      continue;
    }

    const filename = `${prefix}-${timestamp}-${index + 1}.${format === 'jpeg' ? 'jpg' : format}`;
    const outputPath = path.join(outputDir, filename);
    await fs.writeFile(outputPath, Buffer.from(item.b64_json, 'base64'));
    images.push({
      path: outputPath,
      mimeType: `image/${format}`,
      revisedPrompt: item.revised_prompt,
    });
  }

  if (images.length === 0) {
    throw new Error('Azure image API returned image entries without b64_json.');
  }

  return images;
}

async function callAzureJson(pathSuffix: 'generations', args: GenerateImageArgs) {
  const config = getAzureConfig();
  const url = pathSuffix === 'generations' ? config.generationUrl : config.editUrl;

  const body = {
    prompt: args.prompt,
    size: sanitizeSize(args.size),
    quality: sanitizeQuality(args.quality),
    output_compression: sanitizeCompression(args.output_compression),
    output_format: sanitizeFormat(args.output_format),
    n: sanitizeCount(args.n),
  };

  writeMCPLog(`[AzureImage] POST ${url} body=${JSON.stringify({ ...body, prompt: '[redacted]' })}`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => ({}))) as AzureImageResponse;
  if (!response.ok) {
    throw new Error(json.error?.message || `Azure image API failed with HTTP ${response.status}`);
  }
  return json;
}

async function callAzureEdit(args: EditImageArgs) {
  const config = getAzureConfig();
  const url = config.editUrl;

  const imagePath = path.resolve(args.image_path);
  const imageBytes = await fs.readFile(imagePath);
  const form = new FormData();
  form.append('prompt', args.prompt);
  form.append('image', new Blob([imageBytes]), path.basename(imagePath));

  if (args.mask_path?.trim()) {
    const maskPath = path.resolve(args.mask_path);
    const maskBytes = await fs.readFile(maskPath);
    form.append('mask', new Blob([maskBytes]), path.basename(maskPath));
  }

  form.append('size', sanitizeSize(args.size));
  form.append('quality', sanitizeQuality(args.quality));
  form.append('output_compression', String(sanitizeCompression(args.output_compression)));
  form.append('output_format', sanitizeFormat(args.output_format));
  form.append('n', String(sanitizeCount(args.n)));

  writeMCPLog(`[AzureImage] POST ${url} edit image=${imagePath}`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: form,
  });

  const json = (await response.json().catch(() => ({}))) as AzureImageResponse;
  if (!response.ok) {
    throw new Error(
      json.error?.message || `Azure image edit API failed with HTTP ${response.status}`
    );
  }
  return json;
}

function assertPrompt(args: unknown): asserts args is GenerateImageArgs {
  const prompt = (args as GenerateImageArgs | null)?.prompt;
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('prompt is required.');
  }
}

function assertEditArgs(args: unknown): asserts args is EditImageArgs {
  assertPrompt(args);
  const imagePath = (args as EditImageArgs | null)?.image_path;
  if (typeof imagePath !== 'string' || imagePath.trim().length === 0) {
    throw new Error('image_path is required.');
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'generate_image',
      description:
        'Generate one or more images using Azure OpenAI image generation. Saves images to disk and returns file paths.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Image generation prompt.' },
          size: { type: 'string', description: 'Image size, for example 1024x1024.' },
          quality: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Quality tier.',
          },
          output_format: { type: 'string', enum: ['png', 'jpeg'] },
          output_compression: { type: 'number', description: '0-100 compression value.' },
          n: { type: 'number', description: 'Number of images to generate, 1-4.' },
          output_dir: {
            type: 'string',
            description:
              'Optional output directory. By default, output is written under IMAGE_MCP_OUTPUT_DIR/generated-images.',
          },
          filename_prefix: { type: 'string', description: 'Optional filename prefix.' },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'edit_image',
      description:
        'Edit an existing image using Azure OpenAI image edits. Optional mask_path can constrain the edit. Saves images to disk and returns file paths.',
      inputSchema: {
        type: 'object',
        properties: {
          image_path: { type: 'string', description: 'Path to the input image file.' },
          mask_path: { type: 'string', description: 'Optional path to a mask image.' },
          prompt: { type: 'string', description: 'Edit instruction.' },
          size: { type: 'string', description: 'Output image size, for example 1024x1024.' },
          quality: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Quality tier.',
          },
          output_format: { type: 'string', enum: ['png', 'jpeg'] },
          output_compression: { type: 'number', description: '0-100 compression value.' },
          n: { type: 'number', description: 'Number of images to return, 1-4.' },
          output_dir: { type: 'string', description: 'Optional output directory.' },
          filename_prefix: { type: 'string', description: 'Optional filename prefix.' },
        },
        required: ['image_path', 'prompt'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'generate_image': {
        assertPrompt(args);
        const response = await callAzureJson('generations', args);
        const images = await writeImages(response, args, 'generated-image');
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, images }, null, 2) }] };
      }

      case 'edit_image': {
        assertEditArgs(args);
        const response = await callAzureEdit(args);
        const images = await writeImages(response, args, 'edited-image');
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, images }, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeMCPLog(`[AzureImage] Tool error ${name}: ${message}`);
    return {
      content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message }, null, 2) }],
      isError: true,
    };
  }
});

async function main() {
  writeMCPLog('Azure Image MCP Server starting...');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  writeMCPLog('Azure Image MCP Server running on stdio');
}

main().catch((error) => {
  writeMCPLog(
    `[AzureImage] Fatal error: ${error instanceof Error ? error.stack || error.message : String(error)}`
  );
  process.exit(1);
});
