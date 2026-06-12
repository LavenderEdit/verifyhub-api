# Guía de Integración para Clientes - VerifyHub API

VerifyHub permite a otras aplicaciones descentralizar el envío y la verificación de códigos OTP de forma multi-tenant.

---

## 1. Integración con el SDK de TypeScript

Si trabajas con Node.js, NestJS o React, puedes usar nuestro SDK integrado.

### Inicialización
```typescript
import { VerifyHubSDK } from './sdk/verifyhub-sdk';

const verifyHub = new VerifyHubSDK({
  apiKey: 'vh_live_tu_api_key_aqui',
  baseUrl: 'https://api.verifyhub.com', // O tu dirección local
});
```

### Crear una Verificación (Challenge)
```typescript
try {
  const challenge = await verifyHub.createChallenge({
    channel: 'EMAIL', // O 'WHATSAPP'
    purpose: 'VERIFY_EMAIL',
    destination: 'cliente@example.com',
    locale: 'es', // es / en
    metadata: {
      appName: 'Mi Sistema SaaS',
      actionUrl: 'https://mysaas.com/welcome',
    }
  });

  console.log(`Challenge creado ID: ${challenge.id}, URL firmada: ${challenge.signedUrl}`);
} catch (error) {
  console.error('Error al crear verificación:', error.message);
}
```

### Verificar un Código OTP
```typescript
try {
  const result = await verifyHub.verifyChallenge(challengeId, '123456');
  if (result.verified) {
    console.log('Usuario verificado con éxito!');
  }
} catch (error) {
  console.error('Código inválido o expirado:', error.message);
}
```

### Reenviar un Código OTP (sujeto a cooldown de 60 segundos)
```typescript
const renewed = await verifyHub.resendChallenge(challengeId);
```

---

## 2. Consumo de Webhooks desde la App Cliente

VerifyHub envía eventos en tiempo real firmados con HMAC-SHA256 para notificar cambios de estado en tus verificaciones.

### Validar la firma HMAC del Webhook en Node.js (Express/Fastify)
Cuando recibes una petición en tu endpoint de webhook:
```typescript
import { createHmac } from 'crypto';

function verifyWebhook(reqBody: string, signature: string, timestamp: string, secret: string): boolean {
  // 1. Re-crear el string a firmar: timestamp.body
  const payloadToSign = `${timestamp}.${reqBody}`;
  
  // 2. Calcular la firma esperada usando el secreto del endpoint de webhook
  const expectedSignature = createHmac('sha256', secret)
    .update(payloadToSign)
    .digest('hex');

  // 3. Comparar firmas
  return signature === expectedSignature;
}
```
*Asegúrate de leer el cuerpo de la petición como string plano (Raw Body) antes de procesar JSON para evitar discrepancias de espaciado en la validación de la firma.*
