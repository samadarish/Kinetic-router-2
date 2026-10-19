import { jsxDEV as reactJsxDEV } from 'react/jsx-dev-runtime';
import type { ElementType, Key } from 'react';
import { localizedType, localizedLinkProps } from './jsx-runtime.js';
import { LocalizedElement } from './react.js';
export { Fragment } from 'react/jsx-dev-runtime';
export type { JSX } from 'react/jsx-dev-runtime';

export function jsxDEV(type: ElementType, props: unknown, key: Key | undefined, isStaticChildren: boolean, source?: { fileName: string; lineNumber: number; columnNumber: number }, self?: unknown) {
  return localizedType(type, props)
    ? reactJsxDEV(LocalizedElement, { as: type, elementProps: props }, key, isStaticChildren, source, self)
    : reactJsxDEV(type, localizedLinkProps(type, props), key, isStaticChildren, source, self);
}
