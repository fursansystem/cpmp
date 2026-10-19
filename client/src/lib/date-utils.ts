export function parseDbTimestamp(timestamp: string | Date | null | undefined): Date {
  if (!timestamp) return new Date();
  
  if (timestamp instanceof Date) {
    return isNaN(timestamp.getTime()) ? new Date() : timestamp;
  }
  
  const str = String(timestamp).trim();
  if (!str) return new Date();
  
  let date: Date;
  
  // Try parsing directly first (handles ISO strings and many other formats)
  date = new Date(str);
  if (!isNaN(date.getTime())) return date;
  
  // Handle Postgres space-separated format: "2024-01-01 12:00:00"
  if (str.includes(' ') && !str.includes('T')) {
    // If it's a simple space-separated timestamp, assume UTC if no offset specified
    if (!str.includes('+') && !str.split(' ')[1]?.includes('-')) {
      const withTZ = str.replace(' ', 'T') + 'Z';
      date = new Date(withTZ);
    } else {
      const withT = str.replace(' ', 'T');
      date = new Date(withT);
    }
    
    if (!isNaN(date.getTime())) return date;
  }
  
  // Handle YYYY-MM-DD format
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
    date = new Date(str + 'T00:00:00Z');
    if (!isNaN(date.getTime())) return date;
  }
  
  // Final fallback to current date if parsing failed
  return isNaN(date.getTime()) ? new Date() : date;
}

