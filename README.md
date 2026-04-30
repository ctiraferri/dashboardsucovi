# Sucovi - Dashboard de Métricas Instagram

Dashboard público para visualizar métricas de Instagram de **Sucovi**, una feria mensual de emprendedores.

**Live**: [https://ctiraferri.github.io/dashboardsucovi/](https://ctiraferri.github.io/dashboardsucovi/)

## Vistas

- **Overview**: Seguidores, alcance, engagement, impresiones del período actual
- **2025 vs 2026**: Comparativa año a año con gráficos superpuestos
- **Posts**: Tabla de posts con filtros por tipo y ordenamiento
- **Pre-Feria**: Countdown, métricas de las últimas 2 semanas, calendario de contenido sugerido

## Stack

- HTML + CSS + Chart.js (sin frameworks)
- Python script para fetch de datos vía Instagram Graph API
- GitHub Actions (cron diario) para actualización automática
- GitHub Pages para hosting

## Setup

### 1. Configurar Meta Developer App

1. Ir a [developers.facebook.com](https://developers.facebook.com) → Crear App tipo "Business"
2. Agregar producto "Instagram Graph API"
3. Conectar la página de Facebook asociada a la cuenta de IG
4. Generar token de larga duración (60 días)

### 2. Configurar secrets en GitHub

En el repo → Settings → Secrets and variables → Actions:

- `IG_ACCESS_TOKEN`: Token de acceso de larga duración
- `IG_USER_ID`: ID numérico de la cuenta de Instagram Business

### 3. Activar GitHub Pages

En el repo → Settings → Pages → Source: Deploy from a branch → Branch: `main` / `/ (root)`

### 4. Cargar datos históricos

Editar `data/historical.json` con datos manuales de 2025 para la comparativa.

### 5. Configurar fecha de próxima feria

En `js/app.js`, actualizar la constante `NEXT_FERIA_DATE`:

```js
const NEXT_FERIA_DATE = '2026-06-15'; // Fecha de la próxima feria
```

## Ejecución manual del script

```bash
export IG_ACCESS_TOKEN="tu_token"
export IG_USER_ID="tu_user_id"
python scripts/fetch_metrics.py
```

## Estructura

```
├── index.html              # Dashboard principal
├── css/style.css           # Estilos
├── js/
│   ├── app.js              # Lógica principal
│   └── charts.js           # Configuración de gráficos
├── data/
│   ├── metrics.json        # Métricas diarias (actualizado por API)
│   ├── posts.json          # Posts individuales (actualizado por API)
│   └── historical.json     # Datos 2025 (manual)
├── scripts/
│   ├── fetch_metrics.py    # Script de fetch
│   └── requirements.txt    # Dependencias
└── .github/workflows/
    └── update-metrics.yml  # Cron diario
```
