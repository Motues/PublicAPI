import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface ServiceItem {
  name: string;
  url: string;
  status: 'open' | 'closed';
}

let serviceCache: ServiceItem[] | null = null;
let lastLoadTime: number = 0;
const CACHE_DURATION = 5000; // 5秒缓存

export function loadServices(): ServiceItem[] {
  const now = Date.now();
  
  if (serviceCache && (now - lastLoadTime) < CACHE_DURATION) {
    return serviceCache;
  }

  try {
    const configDir = join(process.cwd(), 'data', 'list');
    const configPath = join(configDir, 'config.json');
    
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
    lastLoadTime = now;
    
    return services;
  } catch (error) {
    console.error('Failed to load services config:', error);
    return [];
  }
}