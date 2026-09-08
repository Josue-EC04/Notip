Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Text;
using System.IO;

public class NotipFS {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool GetWindowRect(IntPtr hWnd, ref RECT lpRect);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", EntryPoint = "GetWindowLong")]
    public static extern int GetWindowLong32(IntPtr hWnd, int nIndex);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint processAccess, bool bInheritHandle, uint processId);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern bool QueryFullProcessImageName(IntPtr hProcess, int flags, StringBuilder lpExeName, ref int lpdwSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    public const int GWL_STYLE = -16;
    public const int GWL_EXSTYLE = -20;
    public const int WS_CAPTION = 0x00C00000;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int WS_EX_TRANSPARENT = 0x00000020;

    static string GetProcName(uint pid) {
        if (pid == 0) return "";
        IntPtr h = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
        if (h == IntPtr.Zero) return "";
        try {
            var sb = new StringBuilder(1024);
            int size = sb.Capacity;
            if (QueryFullProcessImageName(h, 0, sb, ref size)) {
                return Path.GetFileName(sb.ToString()).ToLower();
            }
            return "";
        } catch {
            return "";
        } finally {
            CloseHandle(h);
        }
    }

    public static string Check() {
        try {
            IntPtr hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero) return "0";

            uint pid = 0;
            GetWindowThreadProcessId(hwnd, out pid);
            string proc = GetProcName(pid);

            // Ignorar herramientas de recorte, capturas de pantalla, shell y Notip
            if (proc.Contains("screenclipping") || 
                proc.Contains("snippingtool") || 
                proc.Contains("screensketch") || 
                proc.Contains("snip") || 
                proc.Contains("lightshot") || 
                proc.Contains("sharex") || 
                proc.Contains("greenshot") || 
                proc.Contains("snagit") || 
                proc.Contains("electron") || 
                proc.Contains("notip") || 
                proc.Contains("explorer") || 
                proc.Contains("shellexperiencehost") || 
                proc.Contains("searchhost") || 
                proc.Contains("startmenuexperiencehost") || 
                proc.Contains("lockapp") || 
                proc.Contains("dwm")) {
                return "0";
            }

            var cls = new StringBuilder(256);
            GetClassName(hwnd, cls, 256);
            string clsName = cls.ToString();

            // Clases de sistema y Windows UI (recortes, escritorio, barra de tareas)
            if (clsName == "Progman" || 
                clsName == "WorkerW" || 
                clsName == "Shell_TrayWnd" || 
                clsName == "Shell_SecondaryTrayWnd" || 
                clsName == "ImmersiveLauncher" || 
                clsName == "Windows.UI.Core.CoreWindow" || 
                clsName.Contains("ScreenClipping")) {
                return "0";
            }

            // Título de la ventana
            var titleSb = new StringBuilder(256);
            GetWindowText(hwnd, titleSb, 256);
            string title = titleSb.ToString().ToLower();
            if (title.Contains("screen clipping") || 
                title.Contains("recorte") || 
                title.Contains("snipping") || 
                title.Contains("captura") || 
                title.Contains("task view") || 
                title.Contains("vista de tareas")) {
                return "0";
            }

            // Ventanas de herramientas o con transparencia
            int exStyle = GetWindowLong32(hwnd, GWL_EXSTYLE);
            if ((exStyle & WS_EX_TOOLWINDOW) != 0 || (exStyle & WS_EX_TRANSPARENT) != 0) {
                return "0";
            }

            // Si tiene barra de título estándar (WS_CAPTION), es una ventana normal o maximizada, no pantalla completa
            int style = GetWindowLong32(hwnd, GWL_STYLE);
            if ((style & WS_CAPTION) == WS_CAPTION) {
                return "0";
            }

            var r = new RECT();
            if (!GetWindowRect(hwnd, ref r)) return "0";

            var bounds = Screen.PrimaryScreen.Bounds;
            // Solo activar si cubre toda la pantalla primaria y no tiene bordes/títulos de ventana normal
            bool coversScreen = (r.Left <= bounds.X && r.Top <= bounds.Y && 
                                 r.Right >= (bounds.X + bounds.Width) && 
                                 r.Bottom >= (bounds.Y + bounds.Height));
            return coversScreen ? "1" : "0";
        } catch {
            return "0";
        }
    }
}
"@

while ($true) {
    try {
        [Console]::WriteLine([NotipFS]::Check())
        [Console]::Out.Flush()
    } catch {}
    Start-Sleep -Milliseconds 600
}
