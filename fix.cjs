const fs = require('fs');
let content = fs.readFileSync('src/backend/services/emergencyService.ts', 'utf8');

const newSendWhatsAppAlert = `export const sendWhatsAppAlert = (phone: string, message: string) => {
  const cleanPhone = phone.replace('+', '');
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = \`https://wa.me/\${cleanPhone}?text=\${encodedMessage}\`;
  console.log(\`[WhatsApp API] Dispatching Alert to \${phone}\`);
  if (typeof window !== 'undefined') {
    window.open(whatsappUrl, '_blank');
  }
  return whatsappUrl;
};`;

// Replace from '// export const sendWhatsAppAlert' to the first '};' after 'Twilio Error'
content = content.replace(/\/\/ export const sendWhatsAppAlert =[\s\S]*?Twilio Error:[\s\S]*?\};\r?\n/, newSendWhatsAppAlert + '\n');

fs.writeFileSync('src/backend/services/emergencyService.ts', content);
console.log('Replaced successfully');
