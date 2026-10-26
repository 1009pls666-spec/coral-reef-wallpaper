using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

internal static class WallpaperHost
{
    private const int GWL_STYLE = -16;
    private const int GWL_EXSTYLE = -20;
    private const int WS_CHILD = 0x40000000;
    private const int WS_VISIBLE = 0x10000000;
    private const int WS_POPUP = unchecked((int)0x80000000);
    private const int WS_CAPTION = 0x00C00000;
    private const int WS_THICKFRAME = 0x00040000;
    private const int WS_MINIMIZEBOX = 0x00020000;
    private const int WS_MAXIMIZEBOX = 0x00010000;
    private const int WS_SYSMENU = 0x00080000;
    private const int WS_EX_APPWINDOW = 0x00040000;
    private const int WS_EX_TOOLWINDOW = 0x00000080;
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private const uint WM_SPAWN_WORKER = 0x052C;
    private const uint SMTO_NORMAL = 0x0000;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_FRAMECHANGED = 0x0020;
    private const uint SWP_SHOWWINDOW = 0x0040;
    private const int SW_SHOWNOACTIVATE = 4;
    private static readonly IntPtr HWND_BOTTOM = new IntPtr(1);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private sealed class Candidate
    {
        public IntPtr Handle;
        public long Score;
        public string Name;
    }

    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr FindWindow(string className, string windowName);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string className, string windowName);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetParent(IntPtr child, IntPtr parent);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr GetParent(IntPtr child);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool IsWindow(IntPtr hwnd);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongW", SetLastError = true)]
    private static extern int GetWindowLong(IntPtr hwnd, int index);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongW", SetLastError = true)]
    private static extern int SetWindowLong(IntPtr hwnd, int index, int value);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool ShowWindowAsync(IntPtr hwnd, int command);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetClassName(IntPtr hwnd, StringBuilder className, int maxCount);

    private static string ClassName(IntPtr hwnd)
    {
        StringBuilder value = new StringBuilder(256);
        return GetClassName(hwnd, value, value.Capacity) > 0 ? value.ToString() : "unknown";
    }

    private static void PrimeDesktop(IntPtr progman)
    {
        IntPtr unused;
        SendMessageTimeout(progman, WM_SPAWN_WORKER, new IntPtr(0xD), new IntPtr(0x1), SMTO_NORMAL, 1000, out unused);
        SendMessageTimeout(progman, WM_SPAWN_WORKER, new IntPtr(0xD), IntPtr.Zero, SMTO_NORMAL, 1000, out unused);
        SendMessageTimeout(progman, WM_SPAWN_WORKER, IntPtr.Zero, IntPtr.Zero, SMTO_NORMAL, 1000, out unused);
    }

    private static long IntersectionScore(RECT rect, int x, int y, int width, int height)
    {
        int right = Math.Min(rect.Right, x + width);
        int bottom = Math.Min(rect.Bottom, y + height);
        int left = Math.Max(rect.Left, x);
        int top = Math.Max(rect.Top, y);
        if (right <= left || bottom <= top) return 0;
        return (long)(right - left) * (bottom - top);
    }

    private static void AddCandidate(List<Candidate> candidates, IntPtr hwnd, string name, int x, int y, int width, int height)
    {
        if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) return;
        for (int i = 0; i < candidates.Count; i++)
        {
            if (candidates[i].Handle == hwnd) return;
        }
        RECT rect;
        long score = GetWindowRect(hwnd, out rect) ? IntersectionScore(rect, x, y, width, height) : 0;
        candidates.Add(new Candidate { Handle = hwnd, Score = score, Name = name + ":" + ClassName(hwnd) });
    }

    private static List<Candidate> FindDesktopLayers(IntPtr progman, int x, int y, int width, int height)
    {
        List<Candidate> candidates = new List<Candidate>();
        List<IntPtr> iconHosts = new List<IntPtr>();
        List<IntPtr> blankWorkers = new List<IntPtr>();

        EnumWindows(delegate(IntPtr top, IntPtr ignored)
        {
            IntPtr view = FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (view != IntPtr.Zero)
            {
                iconHosts.Add(top);
                IntPtr workerAfterIcons = FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
                if (workerAfterIcons != IntPtr.Zero) blankWorkers.Add(workerAfterIcons);
            }
            if (ClassName(top) == "WorkerW" && view == IntPtr.Zero) blankWorkers.Add(top);
            return true;
        }, IntPtr.Zero);

        for (int i = 0; i < blankWorkers.Count; i++)
            AddCandidate(candidates, blankWorkers[i], "worker", x, y, width, height);
        for (int i = 0; i < iconHosts.Count; i++)
            AddCandidate(candidates, iconHosts[i], "icon-host", x, y, width, height);
        AddCandidate(candidates, progman, "progman", x, y, width, height);

        candidates.Sort(delegate(Candidate a, Candidate b) { return b.Score.CompareTo(a.Score); });
        return candidates;
    }

    private static bool Attach(IntPtr child, Candidate candidate, int x, int y, int width, int height)
    {
        RECT parentRect;
        if (!GetWindowRect(candidate.Handle, out parentRect)) return false;

        int style = GetWindowLong(child, GWL_STYLE);
        style &= ~(WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU);
        style |= WS_CHILD | WS_VISIBLE;
        SetWindowLong(child, GWL_STYLE, style);

        int exStyle = GetWindowLong(child, GWL_EXSTYLE);
        exStyle &= ~WS_EX_APPWINDOW;
        exStyle |= WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
        SetWindowLong(child, GWL_EXSTYLE, exStyle);

        Marshal.GetLastWin32Error();
        SetParent(child, candidate.Handle);
        if (GetParent(child) != candidate.Handle) return false;

        int childX = x - parentRect.Left;
        int childY = y - parentRect.Top;
        if (!SetWindowPos(child, HWND_BOTTOM, childX, childY, width, height, SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW)) return false;
        ShowWindowAsync(child, SW_SHOWNOACTIVATE);
        return true;
    }

    private static int Main(string[] args)
    {
        long rawHandle;
        int x;
        int y;
        int width;
        int height;
        if (args.Length != 5 ||
            !long.TryParse(args[0], out rawHandle) ||
            !int.TryParse(args[1], out x) ||
            !int.TryParse(args[2], out y) ||
            !int.TryParse(args[3], out width) ||
            !int.TryParse(args[4], out height) ||
            rawHandle == 0 || width <= 0 || height <= 0)
        {
            Console.Error.WriteLine("usage: reef-wallpaper-host hwnd x y width height");
            return 2;
        }

        IntPtr child = new IntPtr(rawHandle);
        if (!IsWindow(child)) return 3;
        IntPtr progman = FindWindow("Progman", null);
        if (progman == IntPtr.Zero) return 4;

        PrimeDesktop(progman);
        List<Candidate> candidates = FindDesktopLayers(progman, x, y, width, height);
        for (int i = 0; i < candidates.Count; i++)
        {
            if (Attach(child, candidates[i], x, y, width, height))
            {
                Console.WriteLine("Windows desktop attached via " + candidates[i].Name);
                return 0;
            }
        }

        Console.Error.WriteLine("No usable WorkerW or Progman desktop layer was found. candidates=" + candidates.Count);
        return 5;
    }
}
