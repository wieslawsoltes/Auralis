#pragma once
#include "pluginterfaces/vst/ivstmessage.h"
#include <atomic>
#include <map>
#include <string>
#include <variant>
#include <vector>
namespace Steinberg{DEF_CLASS_IID(Vst::IMessage) DEF_CLASS_IID(Vst::IAttributeList)}
#define OWNED_UNKNOWN(Type) std::atomic<Steinberg::uint32>refs{1};Steinberg::tresult PLUGIN_API queryInterface(const Steinberg::TUID iid,void**obj)override{if(Steinberg::FUnknownPrivate::iidEqual(iid,Type::iid)||Steinberg::FUnknownPrivate::iidEqual(iid,Steinberg::FUnknown::iid)){*obj=static_cast<Type*>(this);addRef();return Steinberg::kResultOk;}*obj=nullptr;return Steinberg::kNoInterface;}Steinberg::uint32 PLUGIN_API addRef()override{return ++refs;}Steinberg::uint32 PLUGIN_API release()override{auto n=--refs;if(!n)delete this;return n;}
struct HostAttributes final:Steinberg::Vst::IAttributeList{using V=std::variant<Steinberg::int64,double,std::u16string,std::vector<unsigned char>>;std::map<std::string,V>values;OWNED_UNKNOWN(Steinberg::Vst::IAttributeList)
 Steinberg::tresult PLUGIN_API setInt(AttrID id,Steinberg::int64 v)override{if(!id)return Steinberg::kInvalidArgument;values[id]=v;return Steinberg::kResultOk;}Steinberg::tresult PLUGIN_API getInt(AttrID id,Steinberg::int64&v)override{return get(id,v);}
 Steinberg::tresult PLUGIN_API setFloat(AttrID id,double v)override{if(!id)return Steinberg::kInvalidArgument;values[id]=v;return Steinberg::kResultOk;}Steinberg::tresult PLUGIN_API getFloat(AttrID id,double&v)override{return get(id,v);}
 template<class T>Steinberg::tresult get(AttrID id,T&v){auto it=values.find(id?id:"");if(it==values.end())return Steinberg::kResultFalse;if(auto p=std::get_if<T>(&it->second)){v=*p;return Steinberg::kResultOk;}return Steinberg::kResultFalse;}
 Steinberg::tresult PLUGIN_API setString(AttrID id,const Steinberg::Vst::TChar*s)override{if(!id||!s)return Steinberg::kInvalidArgument;values[id]=std::u16string((const char16_t*)s);return Steinberg::kResultOk;}
 Steinberg::tresult PLUGIN_API getString(AttrID id,Steinberg::Vst::TChar*s,Steinberg::uint32 size)override{if(!s||size<2)return Steinberg::kInvalidArgument;std::u16string value;if(get(id,value)!=Steinberg::kResultOk)return Steinberg::kResultFalse;const size_t n=std::min(value.size(),size/2-1ul);memcpy(s,value.data(),n*2);s[n]=0;return Steinberg::kResultOk;}
 Steinberg::tresult PLUGIN_API setBinary(AttrID id,const void*b,Steinberg::uint32 size)override{if(!id||(!b&&size)||size>16*1024*1024)return Steinberg::kInvalidArgument;const auto*p=(const unsigned char*)b;values[id]=std::vector<unsigned char>(p,p+size);return Steinberg::kResultOk;}
 Steinberg::tresult PLUGIN_API getBinary(AttrID id,const void*&b,Steinberg::uint32&size)override{auto it=values.find(id?id:"");if(it==values.end())return Steinberg::kResultFalse;if(auto p=std::get_if<std::vector<unsigned char>>(&it->second)){b=p->data();size=p->size();return Steinberg::kResultOk;}return Steinberg::kResultFalse;}};
struct HostMessage final:Steinberg::Vst::IMessage{std::string id;HostAttributes*attributes=new HostAttributes;~HostMessage(){attributes->release();}OWNED_UNKNOWN(Steinberg::Vst::IMessage)Steinberg::FIDString PLUGIN_API getMessageID()override{return id.c_str();}void PLUGIN_API setMessageID(Steinberg::FIDString s)override{id=s?s:"";}Steinberg::Vst::IAttributeList*PLUGIN_API getAttributes()override{return attributes;}};
