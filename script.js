
// Elementos de la interfaz
const formulario = document.getElementById("formulario");
const entrada = document.getElementById("entrada");
const boton = document.getElementById("enviar");
const mensajes = document.getElementById("mensajes");
const contador = document.getElementById("contador");
const estadoTexto = document.getElementById("estado-texto");

// Configuración de tiempos
const PAUSA_MINIMA = 1500;
const TIEMPO_LIMITE = 30000;
const MAX_CARACTERES = 500;

let ultimoEnvio = 0;
let enviando = false;

// Crear identificador único
function generarId() {
  if (globalThis.crypto &&
      typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return Date.now().toString(36) +
    "-" + Math.random().toString(36).slice(2);
}

// Mantener la misma sesión
function obtenerSesion() {
  let id;

  try {
    id = localStorage.getItem("moda_sessionId");

    if (!id) {
      id = generarId();
      localStorage.setItem("moda_sessionId", id);
    }
  } catch (error) {
    // Si localStorage falla, usar memoria.
    id = generarId();
  }

  return id;
}

const sessionId = obtenerSesion();

// Agregar burbujas al chat
function agregarMensaje(texto, tipo, esError = false) {
  const contenedor = document.createElement("div");
  const burbuja = document.createElement("div");

  contenedor.classList.add("mensaje", tipo);

  if (esError) {
    contenedor.classList.add("error");
  }

  burbuja.classList.add("burbuja");

  // Mostrar texto de forma segura
  burbuja.textContent = texto;

  contenedor.appendChild(burbuja);
  mensajes.appendChild(contenedor);

  mensajes.scrollTop = mensajes.scrollHeight;

  return burbuja;
}

// Activar o desactivar controles
function bloquearInterfaz(bloquear) {
  enviando = bloquear;
  entrada.disabled = bloquear;
  boton.disabled = bloquear;
}

// Leer respuesta del webhook
function interpretarRespuesta(texto) {
  if (!texto.trim()) {
    return "(respuesta vacía)";
  }

  let datos;

  try {
    datos = JSON.parse(texto);
  } catch (error) {
    // Respuesta normal, no JSON
    return texto;
  }

  if (datos !== null &&
      typeof datos === "object" &&
      !Array.isArray(datos)) {

    const campos = [
      "response",
      "respuesta",
      "message",
      "mensaje"
    ];

    for (const campo of campos) {
      const valor = datos[campo];

      if (typeof valor === "string" &&
          valor.trim().length > 0) {
        return valor;
      }
    }
  }

  return "Make respondió, pero sin el campo response";
}

// Esperar sin bloquear la página
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Enviar mensaje a Make
async function enviarMensaje(evento) {
  evento.preventDefault();

  if (enviando) return;

  const mensaje = entrada.value.trim();

  if (!mensaje) return;

  if (mensaje.length > MAX_CARACTERES) {
    estadoTexto.textContent =
      "El máximo permitido es de 500 caracteres.";
    return;
  }

  bloquearInterfaz(true);

  agregarMensaje(mensaje, "usuario");
  entrada.value = "";
  contador.textContent = "0 / 500";

  const burbujaRespuesta = agregarMensaje(
    "Moda está pensando...",
    "agente"
  );

  estadoTexto.textContent = "Enviando mensaje...";

  try {
    // Pausa mínima entre envíos
    const transcurrido = Date.now() - ultimoEnvio;
    const espera = Math.max(
      0, PAUSA_MINIMA - transcurrido
    );

    if (espera > 0) {
      await esperar(espera);
    }

    // Verificar configuración
    if (
      typeof WEBHOOK_URL !== "string" ||
      !WEBHOOK_URL.trim() ||
      WEBHOOK_URL.includes("ACA VA")
    ) {
      throw new Error("SIN_WEBHOOK");
    }

    const controlador = new AbortController();

    // Tiempo límite de 30 segundos
    const temporizador = setTimeout(() => {
      controlador.abort();
    }, TIEMPO_LIMITE);

    try {
      ultimoEnvio = Date.now();

      const respuesta = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId,
          mensaje,
          fecha: new Date().toISOString()
        }),
        signal: controlador.signal
      });

      // Leer siempre como texto
      const texto = await respuesta.text();

      if (!respuesta.ok) {
        throw new Error("HTTP_" + respuesta.status);
      }

      burbujaRespuesta.textContent =
        interpretarRespuesta(texto);

      estadoTexto.textContent = "Respuesta recibida";

    } finally {
      clearTimeout(temporizador);
    }

  } catch (error) {
    let aviso;

    if (error.message === "SIN_WEBHOOK") {
      aviso = "Falta pegar la URL de tu webhook en config.js";

    } else if (error.name === "AbortError") {
      aviso = "Tiempo agotado. Make tardó más de 30 segundos en responder.";

    } else if (error.message.startsWith("HTTP_")) {
      const codigo = error.message.slice(5);

      aviso = `Make respondió con error (código ${codigo}). Revisá que tu escenario esté en Active o que hayas apretado Run once.`;

    } else {
      aviso = "No se pudo conectar con Make. Revisá tu conexión y la URL del webhook.";
    }

    burbujaRespuesta.textContent = aviso;
    burbujaRespuesta.parentElement.classList.add(
      "error"
    );

    estadoTexto.textContent = "Error de conexión";

  } finally {
    // Nunca dejar el chat cargando
    bloquearInterfaz(false);
    entrada.focus();
    mensajes.scrollTop = mensajes.scrollHeight;
  }
}

// Actualizar contador de caracteres
entrada.addEventListener("input", () => {
  contador.textContent =
    `${entrada.value.length} / ${MAX_CARACTERES}`;
});

// Enter envía; Shift + Enter crea otra línea
entrada.addEventListener("keydown", evento => {
  if (
    evento.key === "Enter" &&
    !evento.shiftKey &&
    !evento.isComposing
  ) {
    evento.preventDefault();

    if (!enviando) {
      formulario.requestSubmit();
    }
  }
});

// Escuchar el envío
formulario.addEventListener("submit", enviarMensaje);
