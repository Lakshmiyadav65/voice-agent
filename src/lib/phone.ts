export function formatE164PhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  // Default to India (+91) if 10-digit mobile or Bangalore landline without country code
  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  // If starts with 0 (e.g. 08064266290), replace leading 0 with +91
  if (/^0\d{10}$/.test(cleaned)) {
    return `+91${cleaned.slice(1)}`;
  }
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}
