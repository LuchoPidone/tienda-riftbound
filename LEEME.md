# Tienda Riftbound: cómo publicarla gratis

La tienda tiene dos partes:

- **La tienda** (`tudireccion.netlify.app`): catálogo con todas las cartas de Riftbound, filtros, carrito y pedido por WhatsApp.
- **El administrador** (`tudireccion.netlify.app/admin`): ahí cargás cantidades, precios y los datos de la tienda.

La lista de cartas y las imágenes se cargan solas desde la base pública riftcodex.com y los servidores de Riot. Se actualizan una vez por día.

## Paso 1: subir los archivos a GitHub

1. Creá una cuenta gratis en https://github.com.
2. Arriba a la derecha tocá **+** y elegí **New repository**.
3. Nombre: `tienda-riftbound`. Dejalo en **Public** o **Private** (las dos opciones sirven) y tocá **Create repository**.
4. En la página que aparece, tocá el link **uploading an existing file**.
5. Descomprimí el ZIP en tu computadora. Abrí la carpeta `tienda-riftbound` y arrastrá **todo lo que hay adentro** (las carpetas `public` y `netlify`, y los archivos `netlify.toml`, `package.json` y `LEEME.md`) a la página de GitHub.
6. Tocá **Commit changes**.

## Paso 2: publicar con Netlify

1. Entrá a https://app.netlify.com y registrate con **Sign up with GitHub**.
2. Tocá **Add new project** → **Import an existing project** → **GitHub**.
3. Autorizá el acceso y elegí el repositorio `tienda-riftbound`.
4. En la configuración no cambies nada. Tocá **Deploy**.
5. Esperá 1 o 2 minutos hasta que diga **Published**.

## Paso 3: crear tu contraseña de administrador

1. En Netlify, dentro de tu proyecto, andá a **Project configuration** → **Environment variables**.
2. Tocá **Add a variable**:
   - Key: `ADMIN_PASSWORD`
   - Value: la contraseña que quieras (que sea difícil).
3. Guardá. Después andá a **Deploys** → **Trigger deploy** → **Deploy project** para que tome la contraseña.

## Paso 4: cambiar la dirección (opcional)

En **Project configuration** → **Change project name** podés elegir, por ejemplo, `luchocartas`. La tienda queda en `luchocartas.netlify.app`.

## Paso 5: configurar la tienda

1. Entrá a `tudireccion.netlify.app/admin` con tu contraseña.
2. En **Configuración** completá:
   - El nombre de la tienda.
   - Tu WhatsApp con código de país, sin espacios. Para Argentina: 549 + característica + número, por ejemplo `5492231234567`.
   - Los precios por rareza.
3. En **Stock y precios** buscá tus cartas y cargá las cantidades. Si una carta tiene un precio especial, escribilo. Si dejás el precio vacío, se usa el de su rareza.
4. Tocá **Guardar cambios**. Los cambios se ven en la tienda al instante.

## Cómo funcionan los pedidos

El cliente agrega cartas al carrito y toca **Enviar pedido por WhatsApp**. Se le abre WhatsApp con el pedido escrito (cartas, cantidades y total) listo para mandarte. El cobro lo coordinás vos.

Cuando vendas, descontá las cantidades desde el administrador.

## Si algo falla

- **La tienda dice que no pudo cargar las cartas:** esperá unos minutos y recargá. La primera carga baja más de 1400 cartas y puede tardar.
- **El admin dice "Falta configurar ADMIN_PASSWORD":** revisá el Paso 3 y volvé a publicar.
- **Salió una expansión nueva:** entrá al admin → Configuración → **Actualizar lista de cartas ahora**.

## Mi carpeta (tu colección privada)

Entrá a `tudireccion.netlify.app/carpeta` con la misma contraseña del administrador. Solo vos podés verla.

- **📍 Dónde está:** cada carta tuya con su ubicación: 🏠 en casa, 🃏 en un mazo, 🤝 prestada o 🏷️ en venta en la tienda.
- **Mis cartas** y **Mi colección:** tus cartas que no vendés y tus piezas de colección.
- **Mazos:** pegá la lista de un mazo y las cartas pasan de "en casa" a ese mazo. Si lo desarmás, vuelven a casa.
- **Préstamos:** una carpeta por persona (queda guardada aunque esté vacía). En rojo, los que te deben cartas. Si pasa más de un mes, aparece un aviso arriba de todo.
- **Compras y ventas:** el resumen del año, con lo gastado, lo cobrado y el balance mes por mes.
  - Al **comprar** elegís adónde va: para vos, para vender (y si va a la carpeta de ventas, la caja de bulk o la cajonera) o a la colección.
  - Al **vender** se descuenta primero del stock de la tienda y, si ahí no está, de Mis cartas.

En el administrador, cada carta en venta tiene el campo **Dónde está** (📁 Carpeta de ventas, 📦 Caja de bulk o 🗄️ Cajonera). Ese dato lo ves solo vos: los clientes no lo ven.

**Fotos:** usá el lector de fotos en Claude (https://claude.ai/artifact/LKNSmgC9wk9rEUs4qVHGzn). Te devuelve la lista para pegar en "Cargar cartas", "Registrar compra" o "Registrar venta".
