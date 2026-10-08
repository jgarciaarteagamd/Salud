# Fitness Log

App para registrar las sesiones de gimnasio en Forus. Claude arma la sesión del día según tu historial, tus antecedentes de rodilla derecha y espalda, tus medidas y tu nutrición. Tú registras cada serie (repeticiones, peso, RIR) y ves tu progreso en un mapa muscular.

**App publicada:** https://claude.ai/artifact/EbfYPnw674NNMjvdbyHJDj (privada, se abre desde tu cuenta de claude.ai en el celular o la computadora).

## Secciones

| Pestaña | Qué hace |
|---|---|
| **Inicio** | Mapa muscular (frente y espalda) coloreado por series de la semana, promedio de 4 semanas o cambio de fuerza. Al tocar un músculo ves sus series por semana frente al rango objetivo y el 1RM estimado de cada ejercicio. También muestra indicadores, composición corporal y récords. |
| **Hoy** | **Configurar sesión con Claude**: indicas tiempo, energía, dolor de rodilla y de espalda, y el enfoque que prefieres. Cada ejercicio tiene una tabla donde cada fila es una serie (reps, peso, RIR). Puedes sustituir (con motivo), omitir (con motivo), agregar ejercicios, usar el temporizador de descanso y cerrar con **Guardar sesión**. El borrador se sincroniza mientras entrenas. |
| **Historial** | Sesiones guardadas por mes, con marcas de lo omitido, sustituido o agregado. Cualquier sesión se puede abrir, corregir o eliminar. |
| **Cuerpo** | Medidas (antropometría, bioimpedancia, Samsung Watch) y nutrición (Fitia). Subes la captura, Claude extrae los valores, los revisas y guardas. También se pueden cargar a mano. |
| **Más** | Catálogo de ejercicios (crear, editar, eliminar, subir dibujo, prompt de Higgsfield), perfil para Claude y resumen para el proyecto Mi Salud. |

## Cómo usa Claude los cambios que haces

Cada ejercicio guarda su estado: `hecho`, `omitido` (con motivo), `sustituido` (con el ejercicio original y el motivo) o `agregado`. Al planificar la siguiente sesión, Claude recibe las últimas 10 sesiones con esas marcas. Así sabe, por ejemplo, que el press plano suele estar ocupado, que no alcanzaste el tiempo o que te sobró tiempo para tríceps.

## Datos

Los datos viven en la base de datos del artifact y se sincronizan entre dispositivos. Claude Code también puede leerlos y escribirlos (herramienta `ArtifactData` con la URL de arriba).

| Colección | Contenido |
|---|---|
| `exercises/{id}` | `name`, `primary[]`, `secondary[]`, `equipment`, `knee`/`back` (`ok`·`precaucion`·`evitar`), `cues`, `image` o `imageAsset` |
| `sessions/{id}` | `date`, `status` (`plan`·`en_curso`·`guardada`), `title`, `plan` (razonamiento, calentamiento, precauciones), `checkin`, `items[]` (cada uno con `sets[]` de `{reps, weight, rir, done}`), `post` (RPE, dolor al terminar), `editLog[]` |
| `measurements/{id}` | `date`, `tipo`, `valores{}` (ver `app/js/fields.js`), `imagenes[]` |
| `nutrition/{id}` | `date`, `valores{kcal, proteina, carbohidratos, grasa…}`, `imagenes[]` |
| `profile/main` | Datos personales, objetivo, antecedentes y el contexto pegado desde Mi Salud |

Músculos y rangos semanales de series: `app/js/muscles.js`. 1RM estimado: Epley ajustado por RIR (`peso × (1 + (reps + RIR) / 30)`).

## Dibujos de ejercicios

Los 26 ejercicios base se generaron en Higgsfield (GPT Image, 1:1) con una sola plantilla de estilo: figura gris pizarra, músculos trabajados en rojo `#E5533D` y fondo `#EEF2F4`. La plantilla está en `scripts/prompt.mjs` y también en la app (Más → ejercicio → *Prompt para Higgsfield*), así los ejercicios nuevos quedan con el mismo formato.

Las URLs están en `seed/images.json`. Para incluirlos en la app:

```sh
node scripts/fetch-images.mjs   # descarga a app/img/ex/<id>.png
```

Después hay que volver a publicar el artifact, agregando `app/img/ex/*.png` a sus archivos. Mientras tanto, cada ejercicio muestra una figura con sus músculos resaltados, o el dibujo que subas desde la app.

## Estructura

```
app/index.html        página (se publica como artifact)
app/css/app.css       estilos (claro y oscuro)
app/js/               main, store (db + respaldo local), ai (prompts), stats, anatomy, ui, views/
seed/exercises.json   catálogo base
seed/images.json      dibujos generados en Higgsfield
scripts/              plantilla de prompt, descarga de imágenes, carga del catálogo
```
