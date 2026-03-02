import { load } from 'js-yaml';
import { color } from 'folds';
import { ThemeKind } from '../hooks/useTheme';

export interface CustomThemeData {
  id: string;
  name: string;
  kind: ThemeKind;
  colors: ThemeColorData;
}

interface ColorGroup5 {
  Container: string;
  ContainerHover: string;
  ContainerActive: string;
  ContainerLine: string;
  OnContainer: string;
}

interface ColorGroup10 extends ColorGroup5 {
  Main: string;
  MainHover: string;
  MainActive: string;
  MainLine: string;
  OnMain: string;
}

interface OtherGroup {
  FocusRing: string;
  Shadow: string;
  Overlay: string;
}

export interface ThemeColorData {
  Background: ColorGroup5;
  Surface: ColorGroup5;
  SurfaceVariant: ColorGroup5;
  Primary: ColorGroup10;
  Secondary: ColorGroup10;
  Success: ColorGroup10;
  Warning: ColorGroup10;
  Critical: ColorGroup10;
  Other: OtherGroup;
}

const COLOR_GROUP_5_KEYS: (keyof ColorGroup5)[] = [
  'Container',
  'ContainerHover',
  'ContainerActive',
  'ContainerLine',
  'OnContainer',
];

const COLOR_GROUP_10_KEYS: (keyof ColorGroup10)[] = [
  'Main',
  'MainHover',
  'MainActive',
  'MainLine',
  'OnMain',
  ...COLOR_GROUP_5_KEYS,
];

const OTHER_KEYS: (keyof OtherGroup)[] = ['FocusRing', 'Shadow', 'Overlay'];

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function hasStringKeys(obj: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((k) => typeof obj[k] === 'string');
}

function validateColorData(data: unknown): data is ThemeColorData {
  if (!isObject(data)) return false;
  const groups5: (keyof ThemeColorData)[] = ['Background', 'Surface', 'SurfaceVariant'];
  const groups10: (keyof ThemeColorData)[] = [
    'Primary',
    'Secondary',
    'Success',
    'Warning',
    'Critical',
  ];

  for (const g of groups5) {
    if (!isObject(data[g])) return false;
    if (!hasStringKeys(data[g] as Record<string, unknown>, COLOR_GROUP_5_KEYS)) return false;
  }
  for (const g of groups10) {
    if (!isObject(data[g])) return false;
    if (!hasStringKeys(data[g] as Record<string, unknown>, COLOR_GROUP_10_KEYS)) return false;
  }
  if (!isObject(data.Other)) return false;
  if (!hasStringKeys(data.Other as Record<string, unknown>, OTHER_KEYS)) return false;

  return true;
}

export function parseCustomThemeYaml(yamlStr: string): CustomThemeData {
  const raw = load(yamlStr);
  if (!isObject(raw)) throw new Error('Invalid theme file: root must be an object');
  if (typeof raw.name !== 'string' || raw.name.trim() === '')
    throw new Error('Invalid theme file: "name" is required');
  if (raw.kind !== 'light' && raw.kind !== 'dark')
    throw new Error('Invalid theme file: "kind" must be "light" or "dark"');
  if (!validateColorData(raw.colors))
    throw new Error('Invalid theme file: "colors" section is missing or incomplete');

  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: raw.name as string,
    kind: raw.kind as ThemeKind,
    colors: raw.colors as ThemeColorData,
  };
}

function extractVarName(cssVar: string): string {
  const match = cssVar.match(/^var\((.+)\)$/);
  return match ? match[1] : cssVar;
}

function buildCssVarMap(): Record<string, Record<string, string>> {
  const map: Record<string, Record<string, string>> = {};
  for (const [groupName, group] of Object.entries(color)) {
    map[groupName] = {};
    for (const [key, val] of Object.entries(group as Record<string, string>)) {
      map[groupName][key] = extractVarName(val);
    }
  }
  return map;
}

const cssVarMap = buildCssVarMap();

export function injectCustomThemeStyle(themeData: CustomThemeData): string {
  const className = `custom-theme-${themeData.id}`;
  const existing = document.getElementById(className);
  if (existing) return className;

  const lines: string[] = [];
  for (const [groupName, group] of Object.entries(themeData.colors)) {
    const varGroup = cssVarMap[groupName];
    if (!varGroup) continue;
    for (const [key, value] of Object.entries(group as Record<string, string>)) {
      const varName = varGroup[key];
      if (varName) lines.push(`${varName}:${value}`);
    }
  }

  const style = document.createElement('style');
  style.id = className;
  style.textContent = `.${className}{${lines.join(';')}}`;
  document.head.appendChild(style);
  return className;
}

export function removeCustomThemeStyle(themeData: CustomThemeData): void {
  const className = `custom-theme-${themeData.id}`;
  document.getElementById(className)?.remove();
}

export function injectAllCustomThemeStyles(themes: CustomThemeData[]): void {
  themes.forEach(injectCustomThemeStyle);
}