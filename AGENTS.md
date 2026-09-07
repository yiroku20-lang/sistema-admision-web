# Reglas y Directrices de Arquitectura - Admisión UNSAAC

Este proyecto gestiona los concursos de admisión de la Universidad Nacional de San Antonio Abad del Cusco (UNSAAC). Para garantizar la integridad de los datos, la auditoría y la consistencia operativa, el sistema debe regirse estrictamente por las siguientes directrices:

---

## 1. Estandarización de Modalidades
- Los nombres de las modalidades de admisión deben coincidir de forma estricta y unívoca con el campo `cv_modalidades.nombre` del **Cuadro de Vacantes**.
- No se deben crear modalidades con nombres abreviados, duplicados o divergentes fuera del catálogo oficial de modalidades aprobadas.

---

## 2. Lotes de Postulantes (`pre_revision_archivos`)
- Cada modalidad oficial tiene un **único lote JSON** registrado en la tabla `pre_revision_archivos`, vinculado inequívocamente mediante `modalidad_id`.
- La estructura interna almacena los arrays de `postulantes`, `pagos` y `validaciones`.

---

## 3. Padrón Oficial de Ingresantes (`participantes`)
- Cada ingresante legítimo tiene **exactamente una fila oficial por proceso** de admisión.
- Esto asegura no duplicar el cómputo de vacantes cubiertas, no distorsionar las resoluciones de aprobación ni las estadísticas oficiales remitidas a **SUNEDU** o al Ministerio de Educación.

---

## 4. Protocolo para Exámenes Anulados y Reprogramados (Contingencias Oficiales)
En situaciones donde un concurso o una carrera específica sufra una anulación formal por parte del Consejo Universitario (caso emblemático: **Medicina Humana en el Concurso de Admisión Ordinario 2022-II, Res. N° CU-224-2022-UNSAAC**):

1. **Sin modalidades ficticias:**
   - **No se crea una modalidad ficticia ni separada** en el Cuadro de Vacantes para el examen reprogramado.
   - Todos los resultados y postulantes se unifican bajo el proceso oficial (ej. `CONCURSO DE ADMISIÓN ORDINARIO 2022-II`).

2. **Trazabilidad dual en Pre-Revisión (`pre_revision_archivos`):**
   - Cada postulante afectado conserva el objeto estructurado `examen_anulado` con la nota y el orden de mérito de **ambos exámenes** (1er examen anulado y 2do examen definitivo/reprogramado).
   - La presencia de este objeto activa automáticamente la pestaña **🚨 Examen Anulado (Res. CU-224-2022)** en la interfaz de Pre-Revisión (`ApplicantPreReview.tsx`).

3. **Archivo de evidencia forense (`postulantes_examenes_anulados`):**
   - Toda la evidencia histórica y forense de la anulación (resolución, fecha, motivo, notas duales, méritos duales) se archiva en la tabla dedicada `postulantes_examenes_anulados`.

4. **Regla de oro para el padrón oficial (`participantes`):**
   - En la tabla `participantes` **únicamente figuran los ingresantes que ganaron vacante en el examen definitivo** (con su nota válida y oficial).
   - Su nota previa del examen anulado se resguarda en la columna `nota_examen_anulado`.
   - **Los postulantes que tuvieron nota de ingreso en el examen anulado pero NO lograron ingresar en el examen definitivo NO deben estar en `participantes`** como ingresantes vigentes.
