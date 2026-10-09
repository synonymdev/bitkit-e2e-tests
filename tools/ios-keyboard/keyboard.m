#import <Foundation/Foundation.h>
#import <dlfcn.h>

// Runtime declarations only; Xcode supplies CoreSimulator. This selector is
// also declared in facebook/idb's PrivateHeaders/CoreSimulator/SimDevice.h.
@interface NSObject (KeyboardSimulator)
+ (id)sharedServiceContextForDeveloperDir:(NSString *)path error:(NSError **)error;
- (id)defaultDeviceSetWithError:(NSError **)error;
- (NSArray *)availableDevices;
- (NSUUID *)UDID;
- (NSString *)stateString;
- (BOOL)setHardwareKeyboardEnabled:(BOOL)enabled keyboardType:(unsigned char)type error:(NSError **)error;
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 4 || strcmp(argv[2], "--udid") != 0 ||
            (strcmp(argv[1], "hide") != 0 && strcmp(argv[1], "show") != 0)) {
            fprintf(stderr, "usage: keyboard-control hide|show --udid <simulator UUID>\n");
            return 2;
        }
        NSUUID *udid = [[NSUUID alloc] initWithUUIDString:@(argv[3])];
        if (!udid) { fprintf(stderr, "invalid simulator UUID\n"); return 2; }
        if (!dlopen("/Library/Developer/PrivateFrameworks/CoreSimulator.framework/CoreSimulator", RTLD_NOW)) {
            fprintf(stderr, "CoreSimulator unavailable: %s\n", dlerror()); return 1;
        }
        NSTask *xcode = [[NSTask alloc] init];
        xcode.executableURL = [NSURL fileURLWithPath:@"/usr/bin/xcode-select"];
        xcode.arguments = @[@"-p"];
        NSPipe *pipe = [NSPipe pipe];
        xcode.standardOutput = pipe;
        NSError *error = nil;
        if (![xcode launchAndReturnError:&error]) { fprintf(stderr, "%s\n", error.description.UTF8String); return 1; }
        NSData *data = [pipe.fileHandleForReading readDataToEndOfFile];
        [xcode waitUntilExit];
        if (xcode.terminationStatus != 0) { fprintf(stderr, "xcode-select failed\n"); return 1; }
        NSString *developer = [[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
        Class contextClass = NSClassFromString(@"SimServiceContext");
        id context = [contextClass sharedServiceContextForDeveloperDir:developer error:&error];
        id deviceSet = [context defaultDeviceSetWithError:&error];
        if (!deviceSet) { fprintf(stderr, "cannot open simulator set: %s\n", error.description.UTF8String); return 1; }
        id target = nil;
        for (id device in [deviceSet availableDevices]) {
            if ([[device UDID] isEqual:udid]) { target = device; break; }
        }
        if (!target || ![[target stateString] isEqualToString:@"Booted"]) {
            fprintf(stderr, "the requested simulator must exist and be booted\n"); return 1;
        }
        if (![target respondsToSelector:@selector(setHardwareKeyboardEnabled:keyboardType:error:)]) {
            fprintf(stderr, "this Xcode lacks device-scoped keyboard control\n"); return 1;
        }
        BOOL hide = strcmp(argv[1], "hide") == 0;
        if (![target setHardwareKeyboardEnabled:hide keyboardType:0 error:&error]) {
            fprintf(stderr, "keyboard control failed: %s\n", error.description.UTF8String); return 1;
        }
        printf("software keyboard %s requested for %s; verify the UI before continuing\n", hide ? "hide" : "show", udid.UUIDString.UTF8String);
        return 0;
    }
}
