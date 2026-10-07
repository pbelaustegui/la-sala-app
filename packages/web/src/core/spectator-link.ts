/** The public board link for an app origin (works behind a tunnel because the origin comes from the page). */
export function spectatorLink(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/#/`;
}
