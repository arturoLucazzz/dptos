# Archivos de mercado

Archivos CSV que se editan a mano y alimentan la pantalla `/mercado`. Los lee `lib/market-files.ts`.
Si un archivo tiene un error, la carga falla con un mensaje en español que dice el archivo y la fila.

Reglas comunes: la primera fila es el encabezado exacto; las URL empiezan con `https://`;
un campo con comas va entre comillas; los campos obligatorios no pueden estar vacíos.

## estudios.csv
Estudios de mercado de fuentes oficiales o con nombre. Encabezado: `titulo,autor,url,frecuencia,precios_de_aviso,nota`.
- `precios_de_aviso`: `si` si el estudio usa precios de aviso (portales), `no` si usa ventas o tasaciones.
- `nota`: una línea corta que dice qué mide el estudio.

## voces.csv
Creadores y perfiles sobre inversión inmobiliaria en Perú. Encabezado: `nombre,plataforma,url,tema,vende_asesoria,revisado`.
- `vende_asesoria`: `si` si vende asesoría, cursos, mentoría o propiedades; `no` si no.
- `revisado`: todas las filas nuevas entran con `no`. El dueño pone `si` para publicar una voz; solo las `si` aparecen en la pantalla.

## feeds.csv
Feeds RSS de noticias. Encabezado: `nombre,url,prioridad`. `prioridad` es un número entero; el 1 va primero.

## news-keywords.csv
Palabras clave para filtrar noticias. Encabezado: `palabra`. Una por fila, en minúscula (se permiten tildes).
Se busca la palabra dentro del titular, por eso `inmobiliari` cubre inmobiliario, inmobiliaria e inmobiliarios.
Una palabra clave coincide con cualquier parte del titular, así que cada una debe ser una frase que solo aparece en noticias del mercado (por ejemplo `precio de vivienda`, no `vivienda`).
