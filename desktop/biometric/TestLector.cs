using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Windows.Forms;
using DPFP;
using DPFP.Capture;

namespace TestBiometrico
{
    public class TestForm : Form, DPFP.Capture.EventHandler
    {
        private DPFP.Capture.Capture Capturer;
        private PictureBox pbHuella;
        private Label lblEstado;
        private Button btnReiniciar;

        public TestForm()
        {
            this.Text = "Prueba de Hardware Biométrico - DigitalPersona U.are.U 4500";
            this.Size = new Size(420, 520);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(15, 23, 42);

            lblEstado = new Label();
            lblEstado.Text = "Esperando que coloques el dedo en el sensor...";
            lblEstado.ForeColor = Color.FromArgb(56, 189, 248);
            lblEstado.Font = new Font("Segoe UI", 11, FontStyle.Bold);
            lblEstado.Dock = DockStyle.Top;
            lblEstado.Height = 50;
            lblEstado.TextAlign = ContentAlignment.MiddleCenter;
            this.Controls.Add(lblEstado);

            pbHuella = new PictureBox();
            pbHuella.Size = new Size(220, 280);
            pbHuella.Location = new Point(90, 60);
            pbHuella.BorderStyle = BorderStyle.FixedSingle;
            pbHuella.SizeMode = PictureBoxSizeMode.Zoom;
            pbHuella.BackColor = Color.FromArgb(30, 41, 59);
            this.Controls.Add(pbHuella);

            btnReiniciar = new Button();
            btnReiniciar.Text = "Re-iniciar Sensor";
            btnReiniciar.Size = new Size(220, 40);
            btnReiniciar.Location = new Point(90, 360);
            btnReiniciar.FlatStyle = FlatStyle.Flat;
            btnReiniciar.BackColor = Color.FromArgb(37, 99, 235);
            btnReiniciar.ForeColor = Color.White;
            btnReiniciar.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            btnReiniciar.Click += (s, e) => InitCapture();
            this.Controls.Add(btnReiniciar);

            this.Load += (s, e) => InitCapture();
        }

        private void InitCapture()
        {
            try
            {
                if (Capturer != null)
                {
                    try { Capturer.StopCapture(); } catch { }
                }

                DPFP.Capture.ReadersCollection readers = new DPFP.Capture.ReadersCollection();
                if (readers.Count > 0)
                {
                    Capturer = new DPFP.Capture.Capture(readers[0].SerialNumber, DPFP.Capture.Priority.Normal);
                }
                else
                {
                    Capturer = new DPFP.Capture.Capture(DPFP.Capture.Priority.Normal);
                }

                if (Capturer != null)
                {
                    Capturer.EventHandler = this;
                    Capturer.StartCapture();
                    lblEstado.Text = "🟢 Sensor listo. COLOCA TU DEDO EN EL LECTOR.";
                    lblEstado.ForeColor = Color.FromArgb(52, 211, 153);
                }
            }
            catch (Exception ex)
            {
                lblEstado.Text = "🔴 Error al iniciar sensor: " + ex.Message;
                lblEstado.ForeColor = Color.FromArgb(248, 113, 113);
            }
        }

        #region DPFP Eventos
        public void OnComplete(object Capture, string ReaderSerialNumber, DPFP.Sample Sample)
        {
            try
            {
                DPFP.Capture.SampleConversion converter = new DPFP.Capture.SampleConversion();
                Bitmap bmp = null;
                converter.ConvertToPicture(Sample, ref bmp);

                if (bmp != null)
                {
                    this.Invoke((MethodInvoker)delegate {
                        pbHuella.Image = bmp;
                        lblEstado.Text = "🎉 ¡HUELLA CAPTURADA CON ÉXITO!";
                        lblEstado.ForeColor = Color.FromArgb(52, 211, 153);
                    });
                }
            }
            catch (Exception ex)
            {
                this.Invoke((MethodInvoker)delegate {
                    lblEstado.Text = "Error al procesar: " + ex.Message;
                });
            }
        }

        public void OnFingerTouch(object Capture, string ReaderSerialNumber)
        {
            this.Invoke((MethodInvoker)delegate {
                lblEstado.Text = "☝️ Dedo detectado en el sensor...";
                lblEstado.ForeColor = Color.FromArgb(250, 204, 21);
            });
        }

        public void OnFingerGone(object Capture, string ReaderSerialNumber)
        {
            this.Invoke((MethodInvoker)delegate {
                lblEstado.Text = "🖐️ Dedo retirado. Listo para nueva lectura.";
                lblEstado.ForeColor = Color.FromArgb(56, 189, 248);
            });
        }

        public void OnSampleQuality(object Capture, string ReaderSerialNumber, DPFP.Capture.CaptureFeedback Feedback) { }

        public void OnReaderConnect(object Capture, string ReaderSerialNumber)
        {
            this.Invoke((MethodInvoker)delegate {
                lblEstado.Text = "🟢 Lector conectado: " + ReaderSerialNumber;
            });
        }

        public void OnReaderDisconnect(object Capture, string ReaderSerialNumber)
        {
            this.Invoke((MethodInvoker)delegate {
                lblEstado.Text = "🔴 Lector desconectado.";
                lblEstado.ForeColor = Color.FromArgb(248, 113, 113);
            });
        }
        #endregion

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new TestForm());
        }
    }
}
