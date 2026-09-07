# 🏛️ AGENTS.md - Reglas y Protocolos del Sistema de Admisión UNSAAC
*Documento canónico de directivas para Inteligencias Artificiales y Agentes de Código Autónomos.*

---

## 1. Reglas Institucionales de Admisión

### A. Estandarización de Modalidades
- Los nombres de modalidades deben concordar estrictamente con `cv_modalidades.nombre` del Cuadro de Vacantes.
- Nunca crear modalidades informales ni alterar las mayúsculas/guiones si el catálogo oficial ya las define.

### B. Lotes de Postulantes (`pre_revision_archivos`)
- Cada modalidad oficial mantiene un **único lote JSON** vinculado mediante `modalidad_id` (`cv_modalidades.id`).
- El lote contiene la lista íntegra de postulantes (evaluados, admitidos y no admitidos).
- Alimenta la pantalla de **Pre-Revisión de Postulantes (`ApplicantPreReview.tsx`)**.

### C. Padrón Oficial de Ingresantes (`participantes`)
- **Exactamente una fila por ingresante legítimo y definitivo** por proceso de admisión.
- Prohibido duplicar filas por postulante, ya que altera el cómputo de vacantes cubiertas y los reportes oficiales ante SUNEDU y DIRA.
- Contiene columnas de auditoría: `nota_examen_anulado`, `resolucion_anulacion`, `fecha_examen_anulado`.

---

## 2. Protocolo de Contingencia Forense para Exámenes Anulados y Reprogramados

Cuando un concurso o carrera sufra una anulación formal por Consejo Universitario y se tome un segundo examen reprogramado (caso emblemático: **Medicina Humana en Concurso Ordinario 2022-II, Resolución N° CU-224-2022-UNSAAC**):

1. **Unificación en el Proceso Oficial**:
   - No crear modalidades paralelas ficticias en el Cuadro de Vacantes.
   - El lote oficial en `pre_revision_archivos` sigue siendo el del concurso oficial (`CONCURSO DE ADMISIÓN ORDINARIO 2022-II`).
   - Los resultados válidos definitivos corresponden al **segundo examen reprogramado** (29/09/2022).

2. **Evidencia Dual e Historial Inmutable (`examen_anulado`)**:
   - En el JSON de `pre_revision_archivos`, cada postulante del examen anulado conserva un objeto `examen_anulado` con la nota original (ej. notas 20.00 / 19.50), orden de mérito original, fecha (17/09/2022) y resolución (`CU-224-2022-UNSAAC`).
   - El indicador `"tiene_examen_anulado": true` activa automáticamente la subpestaña **`🚨 Examen Anulado (Res. CU-224-2022)`** en `ApplicantPreReview.tsx`.

3. **Tabla de Auditoría `postulantes_examenes_anulados`**:
   - Todo postulante evaluado en un examen anulado se registra en `postulantes_examenes_anulados` con su doble nota, doble mérito, condición definitiva y resolución legal.
   - Si no ingresó en el segundo examen, su condición final es `ADMISIÓN ANULADA (Res. CU-224-2022)`.

4. **Tratamiento en `participantes`**:
   - **Solo ingresan quienes ganaron vacante en el examen definitivo** (ej. los 8 ingresantes a Medicina Humana y 20 a 2das opciones).
   - Los postulantes con notas preliminares anuladas que no alcanzaron vacante en la reprogramación **NO deben figurar en `participantes`**.
   - Para los ingresantes legítimos, su nota oficial es la del examen válido y su nota previa anulada se resguarda en `nota_examen_anulado`.
