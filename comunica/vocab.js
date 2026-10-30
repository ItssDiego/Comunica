/*
 * Vocabulario de Comunica.
 * Frases en primera persona y en femenino (la paciente es mujer).
 * - t: texto que se muestra y se confirma.
 * - u: true => mensaje urgente (se muestra en rojo y pide avisar al personal).
 * - children: subopciones (un nivel).
 * Para añadir frases propias sin tocar código, usar Ajustes > Frases personalizadas.
 */
'use strict';

const VOCAB = [
  {
    id: 'necesidades',
    title: 'Necesidades',
    icon: '🩺',
    items: [
      { t: 'Me cuesta respirar', u: true },
      { t: 'Tengo flemas, necesito que me aspiren', u: true },
      { t: 'Llamen a la enfermera' },
      {
        t: 'Tengo dolor',
        children: [
          { t: 'Me duele la cabeza' },
          { t: 'Me duele la garganta' },
          { t: 'Me duele donde está la cánula' },
          { t: 'Me duele el pecho' },
          { t: 'Me duele el estómago' },
          { t: 'Me duele la espalda' },
          { t: 'Me duele un brazo' },
          { t: 'Me duele una pierna' },
          { t: 'Me duele poco' },
          { t: 'Me duele mucho' },
          { t: 'Me duele en otro lugar' }
        ]
      },
      {
        t: 'Quiero cambiar de posición',
        children: [
          { t: 'Súbanme la cabecera' },
          { t: 'Bájenme la cabecera' },
          { t: 'Quiero girarme a la derecha' },
          { t: 'Quiero girarme a la izquierda' },
          { t: 'Acomódenme la almohada' },
          { t: 'Muévanme las piernas' },
          { t: 'Quiero sentarme' }
        ]
      },
      { t: 'Me molesta la cánula' },
      { t: 'Tengo sed' },
      { t: 'Tengo la boca seca' },
      { t: 'Tengo hambre' },
      { t: 'Tengo frío' },
      { t: 'Tengo calor' },
      { t: 'Necesito ir al baño' },
      { t: 'Necesito que me cambien' },
      { t: 'Me pica' },
      { t: 'Tengo náuseas' },
      { t: 'Me siento mareada' },
      { t: 'Quiero descansar' },
      {
        t: 'Luz y ruido',
        children: [
          { t: 'Apaguen la luz' },
          { t: 'Prendan la luz' },
          { t: 'Me molesta el ruido' },
          { t: 'Cierren la cortina' }
        ]
      }
    ]
  },
  {
    id: 'emociones',
    title: 'Cómo me siento',
    icon: '💬',
    items: [
      { t: 'Estoy bien' },
      { t: 'Estoy tranquila' },
      { t: 'Estoy cansada' },
      { t: 'Tengo miedo' },
      { t: 'Estoy preocupada' },
      { t: 'Estoy nerviosa' },
      { t: 'Estoy triste' },
      { t: 'Estoy frustrada' },
      { t: 'Estoy confundida' },
      { t: 'Me siento sola' },
      { t: 'Estoy aburrida' },
      { t: 'Estoy contenta' }
    ]
  },
  {
    id: 'familia',
    title: 'Familia',
    icon: '🏠',
    items: [
      { t: 'Quiero ver a mi familia' },
      { t: 'Extraño a mi familia' },
      { t: '¿Quién viene hoy?' },
      { t: '¿Cómo están en casa?' },
      { t: 'Llamen a mi familia' },
      { t: 'Quédate conmigo' },
      { t: 'Puedes ir a descansar' },
      { t: 'Gracias por estar aquí' },
      { t: 'Te quiero' }
    ]
  },
  {
    id: 'conversacion',
    title: 'Conversación',
    icon: '🗨️',
    items: [
      { t: 'Hola' },
      { t: 'Gracias' },
      { t: 'Por favor' },
      { t: 'Está bien' },
      { t: 'Espera un momento' },
      { t: 'Háblame más despacio' },
      { t: 'Háblame más fuerte' },
      { t: 'No entendí' },
      { t: 'Me equivoqué' },
      { t: 'Cuéntame algo' },
      { t: 'No quiero hablar ahora' },
      { t: 'Quiero estar sola un rato' },
      { t: 'Prendan la televisión' },
      { t: 'Pónganme música' },
      { t: 'Lo siento' }
    ]
  },
  {
    id: 'preguntas',
    title: 'Preguntas',
    icon: '❓',
    items: [
      { t: '¿Qué hora es?' },
      { t: '¿Qué día es hoy?' },
      { t: '¿Dónde estoy?' },
      { t: '¿Qué me pasó?' },
      { t: '¿Cuánto tiempo llevo aquí?' },
      { t: '¿Cuándo viene el doctor?' },
      { t: '¿Cómo estoy evolucionando?' },
      { t: '¿Qué medicina me están dando?' },
      { t: '¿Puedo comer o tomar algo?' },
      { t: '¿Puedo levantarme?' },
      { t: '¿Cuándo podré hablar?' },
      { t: '¿Cuándo me dan de alta?' }
    ]
  }
];

/* Palabras sueltas para el constructor de frases. */
const WORDS = [
  'Quiero', 'No quiero', 'Necesito', 'Tengo', 'Estoy', 'Me siento', 'Me duele',
  'Sí', 'No', 'Por favor', 'Gracias', 'Más', 'Menos', 'Ahora', 'Después', 'Mañana',
  'Aquí', 'Agua', 'Baño', 'Cama', 'Casa', 'Familia', 'Doctor', 'Enfermera',
  '¿Qué?', '¿Cuándo?', '¿Dónde?', '¿Quién?', '¿Por qué?'
];

/* Grupos del abecedario para el escaneo en dos pasos (grupo -> letra). */
const LETTER_GROUPS = [
  ['A', 'B', 'C', 'D', 'E'],
  ['F', 'G', 'H', 'I', 'J'],
  ['K', 'L', 'M', 'N', 'Ñ'],
  ['O', 'P', 'Q', 'R', 'S'],
  ['T', 'U', 'V', 'W', 'X'],
  ['Y', 'Z']
];

/* Respuestas rápidas. */
const QUICK = {
  si: { label: 'SÍ', text: 'SÍ' },
  no: { label: 'NO', text: 'NO' },
  repetir: { label: 'REPETIR', text: 'Repite, por favor' },
  cancelar: { label: 'CANCELAR', text: 'Cancela, olvídalo' }
};
