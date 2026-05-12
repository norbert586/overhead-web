import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Overhead API',
      version: '1.0.0',
      description: 'Backend API for the Overhead aircraft-spotting app.',
    },
    servers: [
      { url: 'http://localhost:3001', description: 'Local dev' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
          required: ['error'],
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                email: { type: 'string', format: 'email' },
                isAdmin: { type: 'boolean' },
              },
            },
          },
        },
        Flight: {
          type: 'object',
          properties: {
            hex: { type: 'string' },
            registration: { type: 'string', nullable: true },
            callsign: { type: 'string', nullable: true },
            aircraftType: { type: 'string', nullable: true },
            manufacturer: { type: 'string', nullable: true },
            owner: { type: 'string', nullable: true },
            operator: { type: 'string', nullable: true },
            country: { type: 'string', nullable: true },
            altitudeFt: { type: 'number', nullable: true },
            speedKts: { type: 'number', nullable: true },
            bearingDeg: { type: 'number', nullable: true },
            distanceNm: { type: 'number', nullable: true },
            timesSeen: { type: 'integer' },
            firstSeen: { type: 'string', format: 'date-time' },
            lastSeen: { type: 'string', format: 'date-time' },
            photoUrl: { type: 'string', nullable: true },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    path.join(__dirname, 'routes/*.ts'),
    path.join(__dirname, 'routes/*.js'),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
