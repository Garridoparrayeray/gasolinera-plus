const GPFeedback = (() => {
    const ADDRESS = ['garridoparrayeraytx', 'gmail.com'].join('@');
    const MAX_MESSAGE = 1500;
    const KINDS = { suggestion: 'Sugerencia', bug: 'Error', other: 'Otro comentario' };

    const kind = document.getElementById('feedback-kind');
    const message = document.getElementById('feedback-message');
    const technical = document.getElementById('feedback-tech');
    const sendButton = document.getElementById('feedback-send');
    const copyButton = document.getElementById('feedback-copy');
    const note = document.getElementById('feedback-note');
    const count = document.getElementById('feedback-count');

    function say(text) {
        note.textContent = text;
        note.hidden = text === '';
    }

    async function appVersion() {
        const App = GPNative.plugin('App');
        if (App) {
            try {
                const info = await App.getInfo();
                return `${info.version} (${info.build})`;
            } catch (error) {
                return 'desconocida';
            }
        }
        return 'web';
    }

    async function technicalInfo() {
        const lines = [
            `Versión: ${await appVersion()}`,
            `Sistema: ${GPNative.platform()}`,
            `Pantalla de la app: ${document.documentElement.dataset.view || 'desconocida'}`,
            `Conexión: ${navigator.onLine}`,
            `Idioma: ${navigator.language}`,
            `Tamaño de pantalla: ${window.innerWidth}x${window.innerHeight}`,
            `Navegador: ${navigator.userAgent}`,
            `Fecha: ${new Date().toISOString()}`,
        ];
        return lines.join('\n');
    }

    async function build() {
        const text = message.value.trim();
        if (text.length < 5) {
            say('Cuéntanos un poco más para poder ayudarte.');
            return null;
        }
        let body = text.slice(0, MAX_MESSAGE);
        if (technical.checked) {
            body += `\n\n---\nDatos técnicos (no incluyen tu ubicación ni tus datos personales):\n${await technicalInfo()}`;
        }
        return { subject: `Gasolinera+ · ${KINDS[kind.value]}`, body };
    }

    async function send() {
        const mail = await build();
        if (!mail) {
            return;
        }
        const url = `mailto:${ADDRESS}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
        if (GPNative.isNative()) {
            await GPNative.openExternal(url);
        } else {
            window.location.href = url;
        }
        say('Se ha abierto tu aplicación de correo con el mensaje preparado. Pulsa enviar allí. Si no se abre, usa «Copiar mensaje» y escríbenos a ' + ADDRESS + '.');
    }

    async function copy() {
        const mail = await build();
        if (!mail) {
            return;
        }
        const text = `Para: ${ADDRESS}\nAsunto: ${mail.subject}\n\n${mail.body}`;
        try {
            await navigator.clipboard.writeText(text);
            say('Mensaje copiado. Pégalo en un correo a ' + ADDRESS + '.');
        } catch (error) {
            say('No se pudo copiar. Escríbenos a ' + ADDRESS + ' contándonos lo que ocurre.');
        }
    }

    document.querySelectorAll('.feedback-kind').forEach((button) => {
        button.addEventListener('click', () => {
            kind.value = button.dataset.kind;
            document.querySelectorAll('.feedback-kind').forEach((other) => {
                other.setAttribute('aria-pressed', String(other === button));
            });
        });
    });
    message.addEventListener('input', () => {
        count.textContent = `${message.value.length} / ${MAX_MESSAGE}`;
        say('');
    });
    sendButton.addEventListener('click', () => send().catch((error) => say('No se pudo abrir el correo: ' + error.message)));
    copyButton.addEventListener('click', () => copy());

    return { build };
})();
