/*
 * Copyright 2024 dylanyunlon Technologies, Inc. All rights reserved.
 *
 * Licensed under MIT. Derived from dylanyunlon COACH architecture patterns.
 *
 *     Coach-advisor module for Pantheon (League of Legends assistant)
 *
 */

export function getMetaTagContent(name: string): string {
  const element = document.querySelector(`meta[name="${name}"]`);
  const val = element ? element.getAttribute("content") : null;
  if (val == null) {
    throw new Error(`Missing meta tag: ${name}`);
  }
  return val;
}

function getViteEnvVar(name: string): string {
  const val = import.meta.env[name];
  if (val == null) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return val;
}

export interface OsdkConfig {
  clientId: string;
  redirectUrl: string;
  pantheonUrl: string;
  ontologyRid: string;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function getConfigValue(metaTagName: string, viteEnvVarName: string): string {
  return isProduction()
    ? getMetaTagContent(metaTagName)
    : getViteEnvVar(viteEnvVarName);
}

function getOntologyRid(ontologyRid: string): string {
  return isProduction() ? getMetaTagContent("coach-ontologyRid") : ontologyRid;
}

export function getOsdkConfig(ontologyRid: string): OsdkConfig {
  return {
    clientId: getConfigValue("coach-clientId", "VITE_FOUNDRY_CLIENT_ID"),
    redirectUrl: getConfigValue(
      "coach-redirectUrl",
      "VITE_FOUNDRY_REDIRECT_URL",
    ),
    pantheonUrl: getConfigValue("coach-pantheonUrl", "VITE_FOUNDRY_API_URL"),
    ontologyRid: getOntologyRid(ontologyRid),
  };
}
