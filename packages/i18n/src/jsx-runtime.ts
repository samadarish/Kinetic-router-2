import { Fragment, jsx as reactJsx, jsxs as reactJsxs } from 'react/jsx-runtime';
import type { ElementType, Key } from 'react';
import { LocalizedElement, Translated } from './react.js';
export { Fragment } from 'react/jsx-runtime';
export type { JSX } from 'react/jsx-runtime';

const attributes = ['aria-label', 'aria-description', 'aria-valuetext', 'title', 'alt', 'placeholder', 'label'];
const excluded = new Set(['html', 'head', 'body', 'script', 'style', 'meta', 'link', 'title', 'path', 'use', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'defs', 'stop']);
export function localizedType(type: ElementType, props: unknown): boolean {
  if (typeof type !== 'string' || excluded.has(type) || !props || typeof props !== 'object') return false;
  const values = props as Record<string, unknown>;
  return ['pre', 'code', 'kbd', 'samp', 'svg', 'math'].includes(type) || values.translate === 'no'
    || typeof values.children === 'string'
    || (Array.isArray(values.children) && values.children.some(child => typeof child === 'string'))
    || attributes.some(name => typeof values[name] === 'string');
}

export function jsx(type: ElementType, props: unknown, key?: Key) {
  return localizedType(type, props) ? reactJsx(LocalizedElement, { as: type, elementProps: props }, key) : reactJsx(type, localizedLinkProps(type, props), key);
}
export function jsxs(type: ElementType, props: unknown, key?: Key) {
  return localizedType(type, props) ? reactJsxs(LocalizedElement, { as: type, elementProps: props }, key) : reactJsxs(type, localizedLinkProps(type, props), key);
}

export function localizedLinkProps(type: ElementType, props: unknown) {
  if (typeof type === 'string' || !props || typeof props !== 'object') return props;
  const values = props as Record<string, unknown>;
  const children = values.children;
  if ((type === Fragment || 'href' in values || 'to' in values) && (typeof children === 'string' || (Array.isArray(children) && children.some(child => typeof child === 'string')))) {
    // Preserve the JSX runtime's static-child validation for label + icon runs.
    return { ...values, children: (Array.isArray(children) ? reactJsxs : reactJsx)(Translated, { children }) };
  }
  return props;
}
