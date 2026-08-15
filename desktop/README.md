# 🚀 UNSAAC Admin Console - Desktop App (Electron & Auto-Updater)

Esta carpeta contiene la configuración para empaquetar la aplicación en un instalador de escritorio (`.exe` para Windows) con soporte completo de **Auto-actualizaciones transparentes desde GitHub Releases**.

---

## 🛠️ Configuración Inicial (Solo 1 vez)

1. Abre `desktop/package.json`.
2. En la sección `"publish"`, cambia `owner` y `repo` con tu usuario u organización y repositorio de GitHub:
   ```json
   "publish": {
     "provider": "github",
     "owner": "tu-usuario-github",
     "repo": "tu-repositorio",
     "releaseType": "release"
   }
   ```

---

## 📦 Flujo de Trabajo para Publicar Actualizaciones

### Paso 1: Incrementar la versión
Modifica la versión en `desktop/package.json`:
- De `"version": "1.0.0"` a `"version": "1.0.1"`

### Paso 2: Compilar el Frontend y el Ejecutable Localmente
Desde la raíz del proyecto:
```bash
# 1. Compilar aplicación web
npm run build

# 2. Entrar a desktop e instalar dependencias (si es primera vez)
cd desktop
npm install

# 3. Compilar el instalador .exe y el manifiesto latest.yml
npm run dist
```
Los archivos de salida se generarán en `desktop/dist/`:
- `UNSAAC Consola de Administración Setup 1.0.1.exe` (Instalador ejecutable)
- `latest.yml` (Manifiesto de versión para el auto-updater)
- `UNSAAC Consola de Administración Setup 1.0.1.exe.blockmap` (Para descargas diferenciales rápidas)

---

## ☁️ Publicación en GitHub (2 Opciones)

### Opción A: Automática vía GitHub Actions (Recomendado)
Crea una etiqueta git con el número de versión y súbela a GitHub:
```bash
git tag v1.0.1
git push origin v1.0.1
```
El workflow de GitHub Actions (`.github/workflows/release-desktop.yml`) compilará automáticamente el `.exe` y creará el Release con `latest.yml`.

### Opción B: Publicación Manual desde tu PC
Genera un GitHub Personal Access Token con permisos `repo` y ejecuta:
```bash
# En Windows (PowerShell):
$env:GH_TOKEN="tu_token_github_aqui"
npm run dist:publish
```
O simplemente sube manualmente los 3 archivos de `desktop/dist/` (`.exe`, `latest.yml`, `.blockmap`) a un nuevo Release en GitHub.

---

## 🔄 ¿Cómo experimenta la actualización el usuario final?
1. Al abrir la app en Windows, Electron consulta en segundo plano si hay una versión superior en GitHub.
2. Si encuentra una nueva versión, muestra un aviso interactivo en la barra lateral o una ventana emergente.
3. Descarga la actualización en segundo plano mostrando la barra de progreso.
4. Al terminar, le solicita un clic al usuario para reiniciar y aplicar la nueva versión de inmediato.
