import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const CACHE_DURATION = 5000; // 5秒缓存

export interface ServiceItem {
  name: string;
  url: string;
  status: 'open' | 'closed';
}

let serviceCache: ServiceItem[] | null = null;
let lastLoadTime_list: number = 0;
export function loadServices(): ServiceItem[] {
  const now = Date.now();
  
  if (serviceCache && (now - lastLoadTime_list) < CACHE_DURATION) {
    return serviceCache;
  }

  try {
    const configDir = join(process.cwd(), 'data', 'config');
    const configPath = join(configDir, 'services.json');
    
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    
    if (!existsSync(configPath)) {
      const defaultContent = '[]';
      writeFileSync(configPath, defaultContent, 'utf-8');
      console.log('Created default services config file');
    }
    
    const fileContent = readFileSync(configPath, 'utf-8');
    const services: ServiceItem[] = JSON.parse(fileContent);
    
    serviceCache = services;
    lastLoadTime_list = now;
    
    return services;
  } catch (error) {
    console.error('Failed to load services config:', error);
    return [];
  }
}

export interface SiteConfig {
  siteName: string;
  description: string[];
  footer: string;
}

let siteConfigCache: SiteConfig | null = null;
let lastLoadTime_site: number = 0;

const defaultConfig: SiteConfig = {
  siteName: 'Public API Server',
  description: ['A public API server for everyone.', 'Welcome to Public API Server'],
  footer: '系统运行良好，欢迎使用！'
};

export function loadSiteConfig(): SiteConfig {
  const now = Date.now();
  
  if (siteConfigCache && (now - lastLoadTime_site) < CACHE_DURATION) {
    return siteConfigCache;
  }

  try {
    const configDir = join(process.cwd(), 'data', 'config');
    const configPath = join(configDir, 'site.json');
    
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    
    if (!existsSync(configPath)) {
      writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      console.log('Created default site config file');
      siteConfigCache = defaultConfig;
      lastLoadTime_site = now;
      return defaultConfig;
    }
    
    const fileContent = readFileSync(configPath, 'utf-8');
    const config: SiteConfig = JSON.parse(fileContent);
    
    siteConfigCache = {
      siteName: config.siteName || defaultConfig.siteName,
      description: Array.isArray(config.description) ? config.description : defaultConfig.description,
      footer: config.footer || defaultConfig.footer
    };
    lastLoadTime_site = now;
    
    return siteConfigCache;
  } catch (error) {
    console.error('Failed to load site config:', error);
    return defaultConfig;
  }
}