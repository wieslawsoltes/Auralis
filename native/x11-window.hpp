#pragma once
#ifdef AURALIS_X11
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <poll.h>
#include <unistd.h>
#include <chrono>
#include <map>
// The plug-in owns its child. The host owns the embedding parent and XEmbed focus.
struct NativeWindow {
 Display*display=nullptr;Window window=0,child=0;Atom closeAtom{},embedAtom{},infoAtom{};bool closed=false;uint32_t width=640,height=480;
 NativeWindow(const char*title,uint32_t w,uint32_t h):width(w),height(h){display=XOpenDisplay(nullptr);require(display,"No X11 display available; start the companion in a desktop session");window=XCreateSimpleWindow(display,DefaultRootWindow(display),0,0,w,h,0,0,0x243441);XStoreName(display,window,title);XSelectInput(display,window,StructureNotifyMask|SubstructureNotifyMask|FocusChangeMask|KeyPressMask|KeyReleaseMask);closeAtom=XInternAtom(display,"WM_DELETE_WINDOW",False);embedAtom=XInternAtom(display,"_XEMBED",False);infoAtom=XInternAtom(display,"_XEMBED_INFO",False);XSetWMProtocols(display,window,&closeAtom,1);XMapWindow(display,window);XFlush(display);}
 ~NativeWindow(){if(display){if(window)XDestroyWindow(display,window);XCloseDisplay(display);}}
 void resize(uint32_t w,uint32_t h){require(w>=16&&h>=16&&w<=8192&&h<=8192,"Editor size out of bounds");width=w;height=h;XResizeWindow(display,window,w,h);XFlush(display);}
 void message(long kind,long detail=0,long data1=0,long data2=0){if(!child)return;XEvent e{};e.xclient.type=ClientMessage;e.xclient.window=child;e.xclient.message_type=embedAtom;e.xclient.format=32;e.xclient.data.l[0]=CurrentTime;e.xclient.data.l[1]=kind;e.xclient.data.l[2]=detail;e.xclient.data.l[3]=data1;e.xclient.data.l[4]=data2;XSendEvent(display,child,False,NoEventMask,&e);XFlush(display);}
 void embed(Window candidate){if(!candidate||candidate==child)return;Atom type;int format;unsigned long count,rest;unsigned char*data=nullptr;bool aware=XGetWindowProperty(display,candidate,infoAtom,0,2,False,infoAtom,&type,&format,&count,&rest,&data)==Success&&format==32&&count==2;if(data)XFree(data);if(!aware)return;child=candidate;message(0,0,window,0);message(1);}
 void focus(){if(!child)return;XWindowAttributes a{};if(XGetWindowAttributes(display,child,&a)&&a.map_state==IsViewable){XSetInputFocus(display,child,RevertToParent,CurrentTime);message(4,0);}}
 template<class F>void events(F callback){while(XPending(display)){XEvent event;XNextEvent(display,&event);if(event.type==ClientMessage&&event.xclient.window==window&&Atom(event.xclient.data.l[0])==closeAtom)closed=true;else if(event.type==DestroyNotify){if(event.xdestroywindow.window==window){window=0;closed=true;}if(event.xdestroywindow.window==child)child=0;}else if(event.type==MapNotify&&event.xmap.event==window)embed(event.xmap.window);else if(event.type==ReparentNotify&&event.xreparent.parent==window)embed(event.xreparent.window);else if(event.type==ClientMessage&&event.xclient.message_type==embedAtom&&event.xclient.data.l[1]==3)focus();else if(event.type==FocusIn&&event.xfocus.window==window){message(1);focus();}else if(event.type==FocusOut&&event.xfocus.window==window&&event.xfocus.detail!=NotifyInferior){message(5);message(2);}callback(event);}}
};
inline std::string controlCommand(){pollfd p{STDIN_FILENO,POLLIN,0};if(poll(&p,1,0)>0&&(p.revents&POLLIN)){char b[128];auto n=read(STDIN_FILENO,b,sizeof(b));if(n>0)return std::string(b,n);}return {};}
inline uint64_t monotonicMs(){return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();}
#endif
