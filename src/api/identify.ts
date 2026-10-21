import { cgiGet } from './ubus'

/**
 * Raw signals returned by `modern-identify` (router-side nixio probe).
 *
 * Everything here is optional: a device that answers nothing still produces a
 * valid object with empty lists, and an older deployment without the CGI
 * makes the call fail — the caller then falls back to passive identification.
 */
export interface IdentifyProbe {
  ip: string
  tcp?: number[]
  miio?: { did: number } | null
  mitv?: { model?: string } | null
  gateway?: { model?: string } | null
  ssdp?: { server?: string; st?: string; usn?: string; location?: string } | null
  mdns?: string[]
}

/** Probes one LAN address. Returns null when the CGI is unavailable. */
export async function identifyDevice(ip: string): Promise<IdentifyProbe | null> {
  try {
    const probe = await cgiGet<IdentifyProbe>(
      `/cgi-bin/modern-data?what=identify&ip=${encodeURIComponent(ip)}`
    )
    return probe && typeof probe === 'object' ? probe : null
  } catch {
    return null
  }
}
