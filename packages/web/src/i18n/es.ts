/** All user-facing copy (neutral Spanish). Later tasks add keys as screens need them. */
export const es = {
  'app.title': 'La Sala',
  'app.tagline': 'Mesa de juez de esgrima',
  'home.intro': 'Elige una pista para empezar a arbitrar.',
  'judge.title': 'Pista {piste}',
  'judge.placeholder': 'Aquí irá el marcador de la pista.',
  'nav.back': 'Volver al inicio',
  'notFound.title': 'Página no encontrada',
  'notFound.body': 'La dirección no existe. Vuelve al inicio.',
} as const;

export type CopyKey = keyof typeof es;
