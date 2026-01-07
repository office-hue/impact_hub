import fs from 'fs/promises';
import path from 'path';

export interface CoreTemplate {
  id: string;
  label: string;
  description?: string;
  outputTypes?: string[];
  categories?: string[];
}

export interface CoreWorkspace {
  id: string;
  label: string;
  description?: string;
  driveRoot: string;
  tags: string[];
  templates: CoreTemplate[];
  allowedRoles?: string[];
}

const DEFAULT_WORKSPACES: CoreWorkspace[] = [
  {
    id: 'impactshop',
    label: 'Impact Shop',
    description: 'Kupon, NGO és Impact Shop tartalmak generálása.',
    driveRoot: '/Company/ImpactShop',
    tags: ['impact', 'ngo', 'marketing'],
    templates: [
      {
        id: 'campaign-brief',
        label: 'Kampány brief',
        description: 'Rövid leírás új Impact Shop kampányhoz.',
        outputTypes: ['gdoc'],
        categories: ['marketing'],
      },
      {
        id: 'ngo-update',
        label: 'NGO update',
        description: 'Heti NGO státuszriport.',
        outputTypes: ['gdoc', 'sheet'],
        categories: ['ngo'],
      },
    ],
  },
  {
    id: 'finance',
    label: 'Pénzügy / Könyvelés',
    description: 'Billingo, Cashbook, könyvelői csomagok.',
    driveRoot: '/Company/Finance',
    tags: ['billingo', 'cashbook', 'accounting'],
    templates: [
      {
        id: 'monthly-accountant-pack',
        label: 'Havi könyvelő csomag',
        description: 'Számlák, igazolások összegyűjtése Drive-ba + ellenőrző lista.',
        outputTypes: ['gdoc', 'sheet', 'folder'],
        categories: ['accounting'],
      },
      {
        id: 'cashbook-sync',
        label: 'Cashbook szinkron',
        description: 'Cashbook API-n keresztüli egyeztetés / audit log.',
        outputTypes: ['json', 'sheet'],
        categories: ['cashbook'],
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operáció / Asszisztencia',
    description: 'Inbox triage, meeting note, admin feladatok.',
    driveRoot: '/Company/Operations',
    tags: ['ops', 'assistant'],
    templates: [
      {
        id: 'inbox-triage',
        label: 'Inbox feldolgozás',
        description: 'Gmail label alapján címkézés + válasz draft.',
        outputTypes: ['gdoc', 'gmail'],
        categories: ['email'],
      },
      {
        id: 'document-kit',
        label: 'Dokumentum kinyerés',
        description: 'PDF / Excel -> strukturált adat + Drive mentés.',
        outputTypes: ['sheet', 'json'],
        categories: ['ocr'],
      },
    ],
  },
];

const CONFIG_FILE = process.env.CORE_WORKSPACES_FILE
  ? path.resolve(process.env.CORE_WORKSPACES_FILE)
  : path.resolve(process.cwd(), 'config', 'core-workspaces.json');

let cachedWorkspaces: CoreWorkspace[] | null = null;
let lastLoadedAt = 0;

async function readConfigFile(): Promise<CoreWorkspace[] | null> {
  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed as CoreWorkspace[];
    }
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('Core workspace konfiguráció beolvasása sikertelen, alapértelmezett lesz használva.', error);
    }
    return null;
  }
}

export async function getCoreWorkspaces(options?: { force?: boolean }): Promise<CoreWorkspace[]> {
  if (!options?.force && cachedWorkspaces && Date.now() - lastLoadedAt < 60_000) {
    return cachedWorkspaces;
  }
  const fileConfig = await readConfigFile();
  cachedWorkspaces = fileConfig?.length ? fileConfig : DEFAULT_WORKSPACES;
  lastLoadedAt = Date.now();
  return cachedWorkspaces;
}

export async function findWorkspaceById(id: string): Promise<CoreWorkspace | undefined> {
  const workspaces = await getCoreWorkspaces();
  return workspaces.find(workspace => workspace.id === id);
}
