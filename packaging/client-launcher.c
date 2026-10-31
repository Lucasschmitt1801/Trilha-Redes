#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>

int main(void) {
    char executable[MAX_PATH];
    char executable_dir[MAX_PATH];
    char root[MAX_PATH];
    char script[MAX_PATH];
    char command_line[MAX_PATH * 2];
    char resolved_script[MAX_PATH];
    DWORD length = GetModuleFileNameA(NULL, executable, sizeof(executable));
    if (!length || length >= sizeof(executable)) return 1;

    strcpy(executable_dir, executable);
    char *separator = strrchr(executable_dir, '\\');
    if (!separator) return 2;
    *separator = '\0';

    snprintf(root, sizeof(root), "%s\\..", executable_dir);
    if (!SetCurrentDirectoryA(root)) return 3;
    snprintf(script, sizeof(script), "%s\\client\\dist\\index.js", root);
    if (!GetFullPathNameA(script, sizeof(resolved_script), resolved_script, NULL)) return 4;
    snprintf(command_line, sizeof(command_line), "node.exe \"%s\"", resolved_script);

    STARTUPINFOA startup = {0};
    PROCESS_INFORMATION process = {0};
    startup.cb = sizeof(startup);
    if (!CreateProcessA(NULL, command_line, NULL, NULL, FALSE, 0, NULL, root, &startup, &process)) return 5;
    WaitForSingleObject(process.hProcess, INFINITE);
    DWORD exit_code = 1;
    GetExitCodeProcess(process.hProcess, &exit_code);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return (int)exit_code;
}
