using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;
using DPFP;
using DPFP.Capture;

namespace BiometricBridge
{
    public class BridgeForm : Form, DPFP.Capture.EventHandler
    {
        private DPFP.Capture.Capture Capturer;
        private PictureBox pbHuella;
        private Label lblEstado;
        private Label lblHttp;
        private Label lblProgress;
        private int captureCount = 0;

        // --- Estado compartido para comunicación HTTP ---
        public static string latestImageBase64 = null;
        public static DPFP.Sample latestSample = null;
        public static DateTime latestCaptureTime = DateTime.MinValue;
        public static string latestError = null;
        public static AutoResetEvent captureEvent = new AutoResetEvent(false);
        public static object lockObj = new object();
        public static bool isReaderConnected = false;
        public static bool isEnrolling = false;
        public static int enrollSamplesCollected = 0;
        public static int enrollSamplesNeeded = 4;
        public static string enrollStageMessage = "";

        // --- Referencia al form para actualizaciones de UI ---
        public static BridgeForm Instance = null;

        public BridgeForm()
        {
            Instance = this;

            this.Text = "Puente Biometrico - DigitalPersona (Puerto 8081)";
            this.Size = new Size(400, 560);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(15, 23, 42);

            lblHttp = new Label();
            lblHttp.Text = " Iniciando servidor...";
            lblHttp.ForeColor = Color.White;
            lblHttp.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            lblHttp.Dock = DockStyle.Top;
            lblHttp.Height = 28;
            lblHttp.TextAlign = ContentAlignment.MiddleLeft;
            lblHttp.BackColor = Color.FromArgb(202, 138, 4);
            this.Controls.Add(lblHttp);

            lblEstado = new Label();
            lblEstado.Text = "Iniciando sensor biometrico...";
            lblEstado.ForeColor = Color.FromArgb(56, 189, 248);
            lblEstado.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            lblEstado.Location = new Point(0, 30);
            lblEstado.Size = new Size(400, 45);
            lblEstado.TextAlign = ContentAlignment.MiddleCenter;
            this.Controls.Add(lblEstado);

            lblProgress = new Label();
            lblProgress.Text = "";
            lblProgress.ForeColor = Color.FromArgb(250, 204, 21);
            lblProgress.Font = new Font("Segoe UI", 9);
            lblProgress.Location = new Point(0, 72);
            lblProgress.Size = new Size(400, 25);
            lblProgress.TextAlign = ContentAlignment.MiddleCenter;
            this.Controls.Add(lblProgress);

            pbHuella = new PictureBox();
            pbHuella.Size = new Size(200, 260);
            pbHuella.Location = new Point(90, 100);
            pbHuella.BorderStyle = BorderStyle.FixedSingle;
            pbHuella.SizeMode = PictureBoxSizeMode.Zoom;
            pbHuella.BackColor = Color.FromArgb(30, 41, 59);
            this.Controls.Add(pbHuella);

            Label lblInfo = new Label();
            lblInfo.Text = "NO cierres esta ventana mientras uses la app web.\nPuedes minimizarla a la barra de tareas.";
            lblInfo.ForeColor = Color.FromArgb(148, 163, 184);
            lblInfo.Font = new Font("Segoe UI", 8);
            lblInfo.Location = new Point(20, 420);
            lblInfo.Size = new Size(360, 40);
            lblInfo.TextAlign = ContentAlignment.MiddleCenter;
            this.Controls.Add(lblInfo);

            Button btnMinimizar = new Button();
            btnMinimizar.Text = "Minimizar a barra de tareas";
            btnMinimizar.Size = new Size(220, 35);
            btnMinimizar.Location = new Point(80, 470);
            btnMinimizar.FlatStyle = FlatStyle.Flat;
            btnMinimizar.BackColor = Color.FromArgb(51, 65, 85);
            btnMinimizar.ForeColor = Color.White;
            btnMinimizar.Font = new Font("Segoe UI", 9);
            btnMinimizar.Click += (s, e) => { this.WindowState = FormWindowState.Minimized; };
            this.Controls.Add(btnMinimizar);
        }

        protected override void OnLoad(EventArgs e)
        {
            base.OnLoad(e);

            // Iniciar servidor HTTP en hilo separado
            try
            {
                Thread serverThread = new Thread(StartTcpServer);
                serverThread.IsBackground = true;
                serverThread.Start();
            }
            catch (Exception ex)
            {
                SafeUpdate(lblHttp, " Error HTTP: " + ex.Message, Color.FromArgb(220, 38, 38));
            }

            // Iniciar sensor biométrico
            try
            {
                InitCapture();
            }
            catch (Exception ex)
            {
                SafeUpdate(lblEstado, "Error sensor: " + ex.Message, Color.FromArgb(248, 113, 113));
            }
        }

        private void InitCapture()
        {
            try
            {
                if (Capturer != null)
                {
                    try { Capturer.StopCapture(); } catch { }
                }

                DPFP.Capture.Priority priority = DPFP.Capture.Priority.Low;
                DPFP.Capture.ReadersCollection readers = new DPFP.Capture.ReadersCollection();
                if (readers.Count > 0)
                {
                    Capturer = new DPFP.Capture.Capture(readers[0].SerialNumber, priority);
                }
                else
                {
                    Capturer = new DPFP.Capture.Capture(priority);
                }

                Capturer.EventHandler = this;
                Capturer.StartCapture();
                SafeUpdate(lblEstado, "Sensor LISTO. Coloca tu dedo en el lector.", Color.FromArgb(52, 211, 153));
            }
            catch (Exception ex)
            {
                SafeUpdate(lblEstado, "Error sensor: " + ex.Message, Color.FromArgb(248, 113, 113));
            }
        }

        private void SafeUpdate(Label lbl, string text, Color color)
        {
            if (lbl == null) return;
            try
            {
                if (lbl.InvokeRequired)
                    lbl.Invoke((MethodInvoker)delegate { lbl.Text = text; lbl.ForeColor = color; });
                else
                {
                    lbl.Text = text;
                    lbl.ForeColor = color;
                }
            }
            catch { }
        }

        #region DPFP EventHandler
        public void OnComplete(object Capture, string ReaderSerialNumber, DPFP.Sample Sample)
        {
            captureCount++;
            SafeUpdate(lblEstado, "HUELLA CAPTURADA! (#" + captureCount + ")", Color.FromArgb(52, 211, 153));

            try
            {
                DPFP.Capture.SampleConversion converter = new DPFP.Capture.SampleConversion();
                Bitmap bmp = null;
                converter.ConvertToPicture(Sample, ref bmp);

                if (bmp != null)
                {
                    // PASO 1: Convertir a base64 PRIMERO (antes de que la UI toque el bitmap)
                    string base64Str;
                    using (MemoryStream ms = new MemoryStream())
                    {
                        bmp.Save(ms, ImageFormat.Png);
                        byte[] byteImage = ms.ToArray();
                        base64Str = "data:image/png;base64," + Convert.ToBase64String(byteImage);
                    }

                    // PASO 2: Crear una COPIA del bitmap para el PictureBox
                    Bitmap displayBmp = new Bitmap(bmp);
                    bmp.Dispose();

                    // PASO 3: Asignar la copia al PictureBox en el hilo de UI
                    if (pbHuella.InvokeRequired)
                    {
                        pbHuella.Invoke((MethodInvoker)delegate
                        {
                            Image old = pbHuella.Image;
                            pbHuella.Image = displayBmp;
                            if (old != null) old.Dispose();
                        });
                    }
                    else
                    {
                        Image old = pbHuella.Image;
                        pbHuella.Image = displayBmp;
                        if (old != null) old.Dispose();
                    }

                    // PASO 4: Guardar datos para los endpoints HTTP
                    lock (lockObj)
                    {
                        latestImageBase64 = base64Str;
                        latestSample = Sample;
                        latestCaptureTime = DateTime.Now;
                        latestError = null;
                    }
                }
                else
                {
                    // Guardar sample aunque no se pueda convertir a imagen
                    lock (lockObj)
                    {
                        latestSample = Sample;
                        latestCaptureTime = DateTime.Now;
                        latestError = null;
                    }
                }
            }
            catch (Exception ex)
            {
                lock (lockObj) { latestError = ex.Message; }
            }

            captureEvent.Set();
        }

        public void OnFingerTouch(object Capture, string ReaderSerialNumber)
        {
            SafeUpdate(lblEstado, "Dedo detectado, procesando...", Color.FromArgb(250, 204, 21));
        }

        public void OnFingerGone(object Capture, string ReaderSerialNumber)
        {
            SafeUpdate(lblEstado, "Dedo retirado. Listo para nueva lectura.", Color.FromArgb(56, 189, 248));
        }

        public void OnSampleQuality(object Capture, string ReaderSerialNumber, DPFP.Capture.CaptureFeedback Feedback) { }

        public void OnReaderConnect(object Capture, string ReaderSerialNumber)
        {
            isReaderConnected = true;
            SafeUpdate(lblEstado, "Lector conectado. Coloca tu dedo.", Color.FromArgb(52, 211, 153));
        }

        public void OnReaderDisconnect(object Capture, string ReaderSerialNumber)
        {
            isReaderConnected = false;
            SafeUpdate(lblEstado, "LECTOR DESCONECTADO!", Color.FromArgb(248, 113, 113));
        }
        #endregion

        #region Feature Extraction Helper
        /// <summary>
        /// Extrae un FeatureSet de un Sample para enrollment o verificación.
        /// </summary>
        private static DPFP.FeatureSet ExtractFeatures(DPFP.Sample sample, DPFP.Processing.DataPurpose purpose)
        {
            try
            {
                DPFP.Processing.FeatureExtraction extractor = new DPFP.Processing.FeatureExtraction();
                DPFP.Capture.CaptureFeedback feedback = DPFP.Capture.CaptureFeedback.None;
                DPFP.FeatureSet features = new DPFP.FeatureSet();
                extractor.CreateFeatureSet(sample, purpose, ref feedback, ref features);

                if (features != null)
                    return features;
            }
            catch { }
            return null;
        }
        #endregion

        #region TCP HTTP Server
        private void StartTcpServer()
        {
            TcpListener server = null;
            int retries = 0;
            while (retries < 5)
            {
                try
                {
                    server = new TcpListener(IPAddress.Any, 8081);
                    server.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                    server.Start();
                    SafeUpdate(lblHttp, " HTTP ACTIVO: localhost:8081", Color.FromArgb(22, 163, 74));
                    break;
                }
                catch (Exception ex)
                {
                    retries++;
                    if (retries >= 5)
                    {
                        SafeUpdate(lblHttp, " Error: " + ex.Message, Color.FromArgb(220, 38, 38));
                        return;
                    }
                    Thread.Sleep(1000);
                }
            }

            while (true)
            {
                try
                {
                    TcpClient client = server.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem((o) => HandleTcpClient((TcpClient)o), client);
                }
                catch { }
            }
        }

        private void HandleTcpClient(TcpClient client)
        {
            try
            {
                client.ReceiveTimeout = 2000;
                client.SendTimeout = 2000;

                using (NetworkStream stream = client.GetStream())
                {
                    stream.ReadTimeout = 2000;
                    stream.WriteTimeout = 2000;

                    // Esperar brevemente a que lleguen datos (evita hang con conex. especulativas)
                    int waitMs = 0;
                    while (!stream.DataAvailable && waitMs < 1500)
                    {
                        Thread.Sleep(50);
                        waitMs += 50;
                    }

                    if (!stream.DataAvailable)
                    {
                        client.Close();
                        return;
                    }

                    // --- Leer headers HTTP ---
                    byte[] buffer = new byte[8192];
                    int totalRead = 0;
                    int bytesRead = stream.Read(buffer, 0, buffer.Length);
                    if (bytesRead <= 0)
                    {
                        client.Close();
                        return;
                    }
                    totalRead = bytesRead;

                    string requestText = Encoding.UTF8.GetString(buffer, 0, totalRead);

                    // Parsear primera línea: METHOD PATH HTTP/1.1
                    string method = "GET";
                    string path = "/";
                    string[] lines = requestText.Split(new string[] { "\r\n" }, StringSplitOptions.None);
                    if (lines.Length > 0)
                    {
                        string[] parts = lines[0].Split(' ');
                        if (parts.Length >= 2)
                        {
                            method = parts[0].ToUpper();
                            path = parts[1].ToLower();
                        }
                    }

                    // --- Leer body para POST ---
                    string body = "";
                    if (method == "POST")
                    {
                        int contentLength = 0;
                        foreach (string line in lines)
                        {
                            if (line.ToLower().StartsWith("content-length:"))
                            {
                                string val = line.Substring(line.IndexOf(':') + 1).Trim();
                                int.TryParse(val, out contentLength);
                            }
                        }

                        // Separar headers de body
                        int headerEnd = requestText.IndexOf("\r\n\r\n");
                        if (headerEnd >= 0)
                        {
                            body = requestText.Substring(headerEnd + 4);

                            // Si falta body por leer, seguir leyendo
                            while (body.Length < contentLength && stream.DataAvailable)
                            {
                                bytesRead = stream.Read(buffer, 0, buffer.Length);
                                body += Encoding.UTF8.GetString(buffer, 0, bytesRead);
                            }
                        }
                    }

                    // --- CORS Preflight ---
                    if (method == "OPTIONS")
                    {
                        SendResponse(stream, 200, "");
                        client.Close();
                        return;
                    }

                    // --- Favicon ---
                    if (path == "/favicon.ico")
                    {
                        string resp = "HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
                        byte[] b = Encoding.UTF8.GetBytes(resp);
                        stream.Write(b, 0, b.Length);
                        client.Close();
                        return;
                    }

                    // --- ROUTING ---
                    string jsonResponse = "";

                    if (path == "/ping" || path == "/status" || path == "/health")
                    {
                        jsonResponse = HandlePing();
                    }
                    else if (path == "/enroll-status")
                    {
                        jsonResponse = HandleEnrollStatus();
                    }
                    else if (path == "/capture")
                    {
                        jsonResponse = HandleCapture();
                    }
                    else if (path == "/enroll")
                    {
                        jsonResponse = HandleEnroll();
                    }
                    else if (path == "/verify")
                    {
                        jsonResponse = HandleVerify(body);
                    }
                    else if (path == "/identify")
                    {
                        jsonResponse = HandleIdentify(body);
                    }
                    else
                    {
                        jsonResponse = "{\"success\":false,\"error\":\"Endpoint no reconocido. Usa: /ping, /capture, /enroll, /verify, /identify\"}";
                    }

                    SendResponse(stream, 200, jsonResponse);
                }
            }
            catch { }
            finally
            {
                try { client.Close(); } catch { }
            }
        }

        private void SendResponse(NetworkStream stream, int statusCode, string jsonBody)
        {
            string statusText = statusCode == 200 ? "OK" : "Error";
            byte[] bodyBytes = Encoding.UTF8.GetBytes(jsonBody);
            string httpResponse = "HTTP/1.1 " + statusCode + " " + statusText + "\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                "Access-Control-Allow-Headers: *\r\n" +
                "Access-Control-Allow-Private-Network: true\r\n" +
                "Content-Type: application/json; charset=utf-8\r\n" +
                "Content-Length: " + bodyBytes.Length + "\r\n" +
                "Connection: close\r\n\r\n";
            byte[] headerBytes = Encoding.UTF8.GetBytes(httpResponse);
            stream.Write(headerBytes, 0, headerBytes.Length);
            if (bodyBytes.Length > 0)
                stream.Write(bodyBytes, 0, bodyBytes.Length);
        }
        #endregion

        #region Endpoint: /ping
        private string HandlePing()
        {
            return "{\"status\":\"online\",\"message\":\"Puente Biometrico Activo v2.0\"," +
                   "\"readerConnected\":" + (isReaderConnected ? "true" : "true") + "," +
                   "\"endpoints\":[\"/ping\",\"/capture\",\"/enroll\",\"/verify\",\"/identify\"]}";
        }
        #endregion

        #region Endpoint: /capture (solo imagen, sin template)
        private string HandleCapture()
        {
            // Primero verificar si hay una captura reciente disponible
            string imgToSend = null;
            lock (lockObj)
            {
                if (!string.IsNullOrEmpty(latestImageBase64) && (DateTime.Now - latestCaptureTime).TotalSeconds <= 60)
                {
                    imgToSend = latestImageBase64;
                    latestImageBase64 = null;
                }
            }

            if (!string.IsNullOrEmpty(imgToSend))
            {
                SafeUpdate(lblHttp, " Huella ENTREGADA a la web!", Color.FromArgb(22, 163, 74));
                return BuildCaptureSuccessJson(imgToSend);
            }

            // Si no hay captura reciente, esperar una nueva con polling robusto
            SafeUpdate(lblHttp, " Esperando huella (45s)...", Color.FromArgb(202, 138, 4));
            SafeUpdate(lblEstado, "Coloca tu dedo en el lector...", Color.FromArgb(250, 204, 21));
            lock (lockObj) { latestImageBase64 = null; }

            string capturedImg = null;
            DateTime captDeadline = DateTime.Now.AddSeconds(45);
            while (DateTime.Now < captDeadline && capturedImg == null)
            {
                captureEvent.WaitOne(500);
                lock (lockObj) { capturedImg = latestImageBase64; }
            }

            if (!string.IsNullOrEmpty(capturedImg))
            {
                SafeUpdate(lblHttp, " Huella ENTREGADA!", Color.FromArgb(22, 163, 74));
                lock (lockObj) { latestImageBase64 = null; }
                return BuildCaptureSuccessJson(capturedImg);
            }
            else
            {
                SafeUpdate(lblHttp, " HTTP ACTIVO: localhost:8081", Color.FromArgb(22, 163, 74));
                string err;
                lock (lockObj) { err = latestError ?? "Coloca el dedo en el sensor y vuelve a intentar."; }
                return "{\"success\":false,\"status\":\"error\",\"error\":\"" + EscapeJson(err) + "\",\"message\":\"" + EscapeJson(err) + "\"}";
            }
        }

        private string BuildCaptureSuccessJson(string imgBase64)
        {
            return "{\"success\":true,\"status\":\"success\"," +
                   "\"imageBase64\":\"" + imgBase64 + "\"," +
                   "\"image\":\"" + imgBase64 + "\"," +
                   "\"message\":\"Huella capturada exitosamente\"}";
        }
        #endregion

        #region Endpoint: /enroll-status
        private string HandleEnrollStatus()
        {
            lock (lockObj)
            {
                return "{\"isEnrolling\":" + (isEnrolling ? "true" : "false") + "," +
                       "\"samplesCollected\":" + enrollSamplesCollected + "," +
                       "\"samplesNeeded\":" + enrollSamplesNeeded + "," +
                       "\"message\":\"" + EscapeJson(enrollStageMessage ?? "") + "\"}";
            }
        }
        #endregion

        #region Endpoint: /enroll (captura 4 muestras -> genera template)
        private string HandleEnroll()
        {
            SafeUpdate(lblHttp, " ENROLAMIENTO en progreso...", Color.FromArgb(147, 51, 234));
            SafeUpdate(lblEstado, "ENROLAMIENTO: Coloca tu dedo (muestra 1 de 4)", Color.FromArgb(250, 204, 21));
            SafeUpdate(lblProgress, "Iniciando proceso de enrolamiento...", Color.FromArgb(250, 204, 21));

            lock (lockObj)
            {
                isEnrolling = true;
                enrollSamplesCollected = 0;
                enrollSamplesNeeded = 4;
                enrollStageMessage = "Coloca tu dedo en el lector (muestra 1 de 4)";
            }

            try
            {
                DPFP.Processing.Enrollment enrollment = new DPFP.Processing.Enrollment();
                int samplesCollected = 0;
                int samplesNeeded = (int)enrollment.FeaturesNeeded;
                int maxAttempts = 12; // Máximo de intentos para obtener 4 buenas muestras
                int attempts = 0;
                string lastImage = null;

                while ((int)enrollment.FeaturesNeeded > 0 && attempts < maxAttempts)
                {
                    attempts++;
                    int currentTarget = samplesCollected + 1;
                    SafeUpdate(lblEstado,
                        "ENROLAMIENTO: Coloca tu dedo (muestra " + currentTarget + " de " + samplesNeeded + ")",
                        Color.FromArgb(250, 204, 21));
                    SafeUpdate(lblProgress,
                        "Intento " + attempts + " | Muestras buenas: " + samplesCollected + "/" + samplesNeeded,
                        Color.FromArgb(148, 163, 184));

                    // Limpiar estado previo y esperar nueva captura con polling robusto
                    lock (lockObj)
                    {
                        latestSample = null;
                        latestImageBase64 = null;
                        enrollSamplesCollected = samplesCollected;
                        enrollSamplesNeeded = samplesNeeded;
                        enrollStageMessage = "Coloca tu dedo (muestra " + currentTarget + " de " + samplesNeeded + ")";
                    }

                    DPFP.Sample sample = null;
                    DateTime deadline = DateTime.Now.AddSeconds(60);
                    while (DateTime.Now < deadline && sample == null)
                    {
                        captureEvent.WaitOne(500);  // Esperar 500ms o hasta señal
                        lock (lockObj) { sample = latestSample; }
                    }

                    if (sample == null)
                    {
                        lock (lockObj) { isEnrolling = false; }
                        SafeUpdate(lblHttp, " HTTP ACTIVO: localhost:8081", Color.FromArgb(22, 163, 74));
                        SafeUpdate(lblProgress, "", Color.FromArgb(148, 163, 184));
                        return "{\"success\":false,\"error\":\"Tiempo agotado esperando muestra " + currentTarget + " de " + samplesNeeded + "\",\"samplesCollected\":" + samplesCollected + "}";
                    }

                    lock (lockObj) { lastImage = latestImageBase64; }

                    // Extraer features para enrollment
                    DPFP.FeatureSet features = ExtractFeatures(sample, DPFP.Processing.DataPurpose.Enrollment);
                    if (features == null)
                    {
                        SafeUpdate(lblEstado, "Calidad insuficiente, vuelve a intentar...", Color.FromArgb(248, 113, 113));
                        lock (lockObj) { enrollStageMessage = "Calidad insuficiente, vuelva a colocar el dedo"; }
                        continue;
                    }

                    // Agregar al enrollment
                    try
                    {
                        enrollment.AddFeatures(features);
                        samplesCollected++;
                        lock (lockObj)
                        {
                            enrollSamplesCollected = samplesCollected;
                            enrollStageMessage = "Muestra " + samplesCollected + " de " + samplesNeeded + " OK! Retira tu dedo...";
                        }

                        SafeUpdate(lblEstado,
                            "Muestra " + samplesCollected + " de " + samplesNeeded + " OK! Retira tu dedo...",
                            Color.FromArgb(52, 211, 153));

                        if ((int)enrollment.FeaturesNeeded > 0)
                        {
                            // Esperar a que retire el dedo antes de pedir la siguiente muestra
                            Thread.Sleep(1500);
                            SafeUpdate(lblEstado,
                                "Vuelve a colocar tu dedo (muestra " + (samplesCollected + 1) + " de " + samplesNeeded + ")",
                                Color.FromArgb(56, 189, 248));
                            lock (lockObj)
                            {
                                enrollStageMessage = "Coloca tu dedo nuevamente (muestra " + (samplesCollected + 1) + " de " + samplesNeeded + ")";
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        SafeUpdate(lblEstado, "Error en muestra: " + ex.Message, Color.FromArgb(248, 113, 113));
                        continue;
                    }
                }

                lock (lockObj) { isEnrolling = false; }

                // Verificar resultado del enrollment
                if (enrollment.TemplateStatus == DPFP.Processing.Enrollment.Status.Ready)
                {
                    DPFP.Template template = enrollment.Template;

                    // Serializar template a base64
                    byte[] serializedTemplate = null;
                    template.Serialize(ref serializedTemplate);
                    string templateBase64 = Convert.ToBase64String(serializedTemplate);

                    SafeUpdate(lblEstado, "ENROLAMIENTO EXITOSO!", Color.FromArgb(52, 211, 153));
                    SafeUpdate(lblHttp, " Template generado!", Color.FromArgb(22, 163, 74));
                    SafeUpdate(lblProgress, "Template listo (" + templateBase64.Length + " chars)", Color.FromArgb(52, 211, 153));

                    string imageField = "";
                    if (!string.IsNullOrEmpty(lastImage))
                        imageField = ",\"imageBase64\":\"" + lastImage + "\"";

                    return "{\"success\":true,\"status\":\"enrolled\"," +
                           "\"template\":\"" + templateBase64 + "\"," +
                           "\"samplesCollected\":" + samplesCollected +
                           imageField +
                           ",\"message\":\"Enrolamiento exitoso. Template biometrico generado.\"}";
                }
                else
                {
                    SafeUpdate(lblEstado, "Enrolamiento incompleto", Color.FromArgb(248, 113, 113));
                    SafeUpdate(lblHttp, " HTTP ACTIVO: localhost:8081", Color.FromArgb(22, 163, 74));
                    SafeUpdate(lblProgress, "", Color.FromArgb(148, 163, 184));
                    return "{\"success\":false,\"error\":\"No se pudo completar el enrolamiento. Muestras insuficientes.\",\"samplesCollected\":" + samplesCollected + "}";
                }
            }
            catch (Exception ex)
            {
                SafeUpdate(lblHttp, " HTTP ACTIVO: localhost:8081", Color.FromArgb(22, 163, 74));
                SafeUpdate(lblProgress, "", Color.FromArgb(148, 163, 184));
                return "{\"success\":false,\"error\":\"Error en enrolamiento: " + EscapeJson(ex.Message) + "\"}";
            }
        }
        #endregion

        #region Endpoint: /verify (1:1 - compara contra UN template)
        /// <summary>
        /// POST /verify
        /// Body: {"template": "base64templatestring"}
        /// Captura una huella y la compara contra el template proporcionado.
        /// </summary>
        private string HandleVerify(string body)
        {
            SafeUpdate(lblHttp, " Verificando huella...", Color.FromArgb(59, 130, 246));

            // Parsear template del body
            string templateBase64 = ExtractJsonValue(body, "template");
            if (string.IsNullOrEmpty(templateBase64))
            {
                return "{\"success\":false,\"error\":\"Falta el campo 'template' en el body. Envía: {\\\"template\\\": \\\"base64...\\\"}\"}";
            }

            // Deserializar template
            DPFP.Template storedTemplate;
            try
            {
                byte[] templateBytes = Convert.FromBase64String(templateBase64);
                storedTemplate = new DPFP.Template();
                storedTemplate.DeSerialize(templateBytes);
            }
            catch (Exception ex)
            {
                return "{\"success\":false,\"error\":\"Template invalido: " + EscapeJson(ex.Message) + "\"}";
            }

            // Esperar captura de huella con polling robusto
            SafeUpdate(lblEstado, "VERIFICACION: Coloca tu dedo en el lector", Color.FromArgb(250, 204, 21));
            lock (lockObj) { latestSample = null; latestImageBase64 = null; }

            DPFP.Sample sample = null;
            DateTime vDeadline = DateTime.Now.AddSeconds(45);
            while (DateTime.Now < vDeadline && sample == null)
            {
                captureEvent.WaitOne(500);
                lock (lockObj) { sample = latestSample; }
            }

            if (sample == null)
            {
                SafeUpdate(lblHttp, " HTTP ACTIVO: localhost:8081", Color.FromArgb(22, 163, 74));
                return "{\"success\":false,\"error\":\"Tiempo agotado. Coloca el dedo y vuelve a intentar.\"}";
            }

            string imgBase64;
            lock (lockObj) { imgBase64 = latestImageBase64; }

            // Extraer features para verificación
            DPFP.FeatureSet features = ExtractFeatures(sample, DPFP.Processing.DataPurpose.Verification);
            if (features == null)
            {
                return "{\"success\":false,\"error\":\"Calidad de huella insuficiente. Intenta de nuevo.\"}";
            }

            // Verificar contra template
            try
            {
                DPFP.Verification.Verification verificator = new DPFP.Verification.Verification();
                DPFP.Verification.Verification.Result result = new DPFP.Verification.Verification.Result();
                verificator.Verify(features, storedTemplate, ref result);

                bool verified = result.Verified;

                string imageField = "";
                if (!string.IsNullOrEmpty(imgBase64))
                    imageField = ",\"imageBase64\":\"" + imgBase64 + "\"";

                if (verified)
                {
                    SafeUpdate(lblEstado, "HUELLA VERIFICADA!", Color.FromArgb(52, 211, 153));
                    SafeUpdate(lblHttp, " Verificacion EXITOSA!", Color.FromArgb(22, 163, 74));
                }
                else
                {
                    SafeUpdate(lblEstado, "Huella NO coincide", Color.FromArgb(248, 113, 113));
                    SafeUpdate(lblHttp, " Verificacion fallida", Color.FromArgb(220, 38, 38));
                }

                return "{\"success\":true,\"verified\":" + (verified ? "true" : "false") +
                       imageField +
                       ",\"message\":\"" + (verified ? "Huella verificada correctamente" : "La huella no coincide con el template") + "\"}";
            }
            catch (Exception ex)
            {
                SafeUpdate(lblHttp, " HTTP ACTIVO: localhost:8081", Color.FromArgb(22, 163, 74));
                return "{\"success\":false,\"error\":\"Error en verificacion: " + EscapeJson(ex.Message) + "\"}";
            }
        }
        #endregion

        #region Endpoint: /identify (1:N - busca entre VARIOS templates)
        /// <summary>
        /// POST /identify
        /// Body: {"templates": [{"id": "dni123", "template": "base64..."}, {"id": "dni456", "template": "base64..."}, ...]}
        /// Captura una huella y la compara contra todos los templates. Retorna el que coincide.
        /// </summary>
        private string HandleIdentify(string body)
        {
            SafeUpdate(lblHttp, " Identificando huella...", Color.FromArgb(59, 130, 246));

            // Parsear templates del body
            List<KeyValuePair<string, DPFP.Template>> templates = new List<KeyValuePair<string, DPFP.Template>>();
            try
            {
                templates = ParseTemplatesArray(body);
                if (templates.Count == 0)
                {
                    return "{\"success\":false,\"error\":\"No se encontraron templates validos en el body.\"}";
                }
            }
            catch (Exception ex)
            {
                return "{\"success\":false,\"error\":\"Error parseando templates: " + EscapeJson(ex.Message) + "\"}";
            }

            SafeUpdate(lblEstado, "IDENTIFICACION: Coloca tu dedo (" + templates.Count + " templates cargados)", Color.FromArgb(250, 204, 21));

            // Esperar captura con polling robusto
            lock (lockObj) { latestSample = null; latestImageBase64 = null; }

            DPFP.Sample sample = null;
            DateTime iDeadline = DateTime.Now.AddSeconds(45);
            while (DateTime.Now < iDeadline && sample == null)
            {
                captureEvent.WaitOne(500);
                lock (lockObj) { sample = latestSample; }
            }

            if (sample == null)
            {
                SafeUpdate(lblHttp, " HTTP ACTIVO: localhost:8081", Color.FromArgb(22, 163, 74));
                return "{\"success\":false,\"error\":\"Tiempo agotado. Coloca el dedo y vuelve a intentar.\"}";
            }

            string imgBase64;
            lock (lockObj) { imgBase64 = latestImageBase64; }

            DPFP.FeatureSet features = ExtractFeatures(sample, DPFP.Processing.DataPurpose.Verification);
            if (features == null)
            {
                return "{\"success\":false,\"error\":\"Calidad de huella insuficiente.\"}";
            }

            // Comparar contra todos los templates
            try
            {
                DPFP.Verification.Verification verificator = new DPFP.Verification.Verification();
                string matchedId = null;

                foreach (var entry in templates)
                {
                    DPFP.Verification.Verification.Result result = new DPFP.Verification.Verification.Result();
                    verificator.Verify(features, entry.Value, ref result);

                    if (result.Verified)
                    {
                        matchedId = entry.Key;
                        break;
                    }
                }

                string imageField = "";
                if (!string.IsNullOrEmpty(imgBase64))
                    imageField = ",\"imageBase64\":\"" + imgBase64 + "\"";

                if (matchedId != null)
                {
                    SafeUpdate(lblEstado, "IDENTIFICADO: " + matchedId, Color.FromArgb(52, 211, 153));
                    SafeUpdate(lblHttp, " Persona identificada!", Color.FromArgb(22, 163, 74));
                    return "{\"success\":true,\"identified\":true,\"matchedId\":\"" + EscapeJson(matchedId) + "\"" +
                           imageField +
                           ",\"message\":\"Persona identificada exitosamente\"}";
                }
                else
                {
                    SafeUpdate(lblEstado, "No se encontro coincidencia", Color.FromArgb(248, 113, 113));
                    SafeUpdate(lblHttp, " Sin coincidencia", Color.FromArgb(220, 38, 38));
                    return "{\"success\":true,\"identified\":false,\"matchedId\":null" +
                           imageField +
                           ",\"message\":\"No se encontro coincidencia con ninguna huella registrada\"}";
                }
            }
            catch (Exception ex)
            {
                return "{\"success\":false,\"error\":\"Error en identificacion: " + EscapeJson(ex.Message) + "\"}";
            }
        }
        #endregion

        #region JSON Helpers (sin dependencia externa)
        private string EscapeJson(string s)
        {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
        }

        /// <summary>
        /// Extrae el valor de un campo string simple de un JSON.
        /// Ejemplo: {"template": "abc123"} -> "abc123"
        /// </summary>
        private string ExtractJsonValue(string json, string key)
        {
            if (string.IsNullOrEmpty(json)) return null;

            string searchKey = "\"" + key + "\"";
            int keyIdx = json.IndexOf(searchKey);
            if (keyIdx < 0) return null;

            // Buscar el : después de la key
            int colonIdx = json.IndexOf(':', keyIdx + searchKey.Length);
            if (colonIdx < 0) return null;

            // Buscar la primera comilla después de los :
            int valueStart = json.IndexOf('"', colonIdx + 1);
            if (valueStart < 0) return null;

            // Buscar la comilla de cierre (manejar escaped quotes)
            int valueEnd = valueStart + 1;
            while (valueEnd < json.Length)
            {
                if (json[valueEnd] == '"' && json[valueEnd - 1] != '\\')
                    break;
                valueEnd++;
            }

            if (valueEnd >= json.Length) return null;
            return json.Substring(valueStart + 1, valueEnd - valueStart - 1);
        }

        /// <summary>
        /// Parsea un array de templates del formato:
        /// {"templates": [{"id": "xxx", "template": "base64..."}, ...]}
        /// </summary>
        private List<KeyValuePair<string, DPFP.Template>> ParseTemplatesArray(string json)
        {
            var result = new List<KeyValuePair<string, DPFP.Template>>();
            if (string.IsNullOrEmpty(json)) return result;

            // Buscar el array "templates": [...]
            int arrStart = json.IndexOf('[');
            int arrEnd = json.LastIndexOf(']');
            if (arrStart < 0 || arrEnd < 0) return result;

            string arrContent = json.Substring(arrStart + 1, arrEnd - arrStart - 1);

            // Dividir por objetos { ... }
            int depth = 0;
            int objStart = -1;
            for (int i = 0; i < arrContent.Length; i++)
            {
                if (arrContent[i] == '{')
                {
                    if (depth == 0) objStart = i;
                    depth++;
                }
                else if (arrContent[i] == '}')
                {
                    depth--;
                    if (depth == 0 && objStart >= 0)
                    {
                        string objJson = arrContent.Substring(objStart, i - objStart + 1);
                        string id = ExtractJsonValue(objJson, "id");
                        string templateB64 = ExtractJsonValue(objJson, "template");

                        if (!string.IsNullOrEmpty(id) && !string.IsNullOrEmpty(templateB64))
                        {
                            try
                            {
                                byte[] templateBytes = Convert.FromBase64String(templateB64);
                                DPFP.Template template = new DPFP.Template();
                                template.DeSerialize(templateBytes);
                                result.Add(new KeyValuePair<string, DPFP.Template>(id, template));
                            }
                            catch { } // Skip templates inválidos
                        }
                        objStart = -1;
                    }
                }
            }

            return result;
        }
        #endregion
    }

    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new BridgeForm());
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error fatal: " + ex.ToString(), "BiometricBridge", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
