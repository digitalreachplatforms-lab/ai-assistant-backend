// AICompanionManager.cpp - CORRECTED VERSION
// Fixed delegate bindings and WebSocket connection
// Copy to: D:/Joevisv3v1/Source/Joevisv3v1/AICompanionManager.cpp

#include "AICompanionManager.h"
#include "Json.h"
#include "JsonUtilities.h"
#include "Misc/Guid.h"
#include "TimerManager.h"

AAICompanionManager::AAICompanionManager()
{
	PrimaryActorTick.bCanEverTick = true;
}

void AAICompanionManager::BeginPlay()
{
	Super::BeginPlay();

	UE_LOG(LogTemp, Warning, TEXT("================================================="));
	UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] *** BEGIN PLAY ***"));
	UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] Actor placed in level!"));
	UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] Backend URL: %s"), *BackendURL);
	UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] WebSocket URL: %s"), *WebSocketURL);
	UE_LOG(LogTemp, Warning, TEXT("================================================="));

	// Generate unique player ID
	PlayerID = GeneratePlayerID();
	UE_LOG(LogTemp, Log, TEXT("[AICompanionManager] Generated Player ID: %s"), *PlayerID);

	// Initialize managers
	InitializeManagers();

	// Auto-connect if enabled
	if (bAutoConnect)
	{
		UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] *** CONNECTING TO BACKEND ***"));
		ConnectToBackend();
	}

	UE_LOG(LogTemp, Warning, TEXT("================================================="));
	UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] 💡 HOW TO TEST CHAT:"));
	UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] 1. Wait for 'PLAYER REGISTERED' message"));
	UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] 2. Auto-test message will fire after 2 seconds"));
	UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] 3. Watch Output Log for responses"));
	UE_LOG(LogTemp, Warning, TEXT("================================================="));
}

void AAICompanionManager::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	UE_LOG(LogTemp, Log, TEXT("[AICompanionManager] EndPlay called"));
	
	if (WebSocketManager)
	{
		WebSocketManager->Disconnect();
	}

	Super::EndPlay(EndPlayReason);
}

void AAICompanionManager::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);
}

void AAICompanionManager::InitializeManagers()
{
	UE_LOG(LogTemp, Log, TEXT("[AICompanionManager] Initializing managers..."));

	// Initialize Voice Manager
	if (bEnableVoice)
	{
		VoiceManager = NewObject<UVoiceManager>(this);
		if (VoiceManager)
		{
			VoiceManager->Initialize(GetWorld());
			UE_LOG(LogTemp, Log, TEXT("[AICompanionManager] ✓ Voice Manager initialized"));
		}
	}

	// Initialize WebSocket Manager
	WebSocketManager = NewObject<UWebSocketManager>(this);
	if (WebSocketManager)
	{
		WebSocketManager->Initialize(GetWorld());
		
		// ✅ FIXED: Bind to correct delegate names that actually exist in WebSocketManager
		WebSocketManager->OnMessage.AddDynamic(this, &AAICompanionManager::HandleWebSocketMessage);
		WebSocketManager->OnConnected.AddDynamic(this, &AAICompanionManager::HandleConnectionStatusChange);
		WebSocketManager->OnError.AddDynamic(this, &AAICompanionManager::HandleWebSocketError);
		
		UE_LOG(LogTemp, Log, TEXT("[AICompanionManager] ✓ WebSocket Manager initialized"));
		UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] ✓ Delegates bound: OnMessage, OnConnected, OnError"));
	}

	// Initialize Memory Manager
	if (bEnableMemory)
	{
		MemoryManager = NewObject<UMemoryManager>(this);
		if (MemoryManager)
		{
			MemoryManager->Initialize(PlayerID);
			UE_LOG(LogTemp, Log, TEXT("[AICompanionManager] ✓ Memory Manager initialized"));
		}
	}

	bIsInitialized = true;
	UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] *** ALL MANAGERS INITIALIZED ***"));
}

void AAICompanionManager::ConnectToBackend()
{
	if (!WebSocketManager)
	{
		UE_LOG(LogTemp, Error, TEXT("[AICompanionManager] WebSocket Manager not initialized!"));
		return;
	}

	UE_LOG(LogTemp, Log, TEXT("[AICompanionManager] Connecting to: %s"), *WebSocketURL);
	
	// ✅ FIXED: Set ServerURL property first (Connect() takes no parameters)
	WebSocketManager->ServerURL = WebSocketURL;
	
	// Then connect (no parameters)
	WebSocketManager->Connect();
}

void AAICompanionManager::DisconnectFromBackend()
{
	if (WebSocketManager)
	{
		WebSocketManager->Disconnect();
	}
}

bool AAICompanionManager::IsConnected() const
{
	return bIsConnected;
}

void AAICompanionManager::SendChatMessage(const FString& Message)
{
	SendTestMessage(Message);
}

void AAICompanionManager::SendTestMessage(const FString& Message)
{
	if (!WebSocketManager || !WebSocketManager->IsConnected())
	{
		UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] Cannot send message: Not connected"));
		return;
	}

	UE_LOG(LogTemp, Warning, TEXT("================================================="));
	UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] 💬 SENDING MESSAGE"));
	UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] Message: %s"), *Message);
	UE_LOG(LogTemp, Warning, TEXT("================================================="));

	// Create JSON message
	TSharedPtr<FJsonObject> JsonObject = MakeShareable(new FJsonObject);
	JsonObject->SetStringField(TEXT("type"), TEXT("chat"));
	JsonObject->SetStringField(TEXT("text"), Message);

	// Convert to string
	FString JsonString;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&JsonString);
	FJsonSerializer::Serialize(JsonObject.ToSharedRef(), Writer);

	// Send via WebSocket
	WebSocketManager->SendMessage(JsonString);
}

void AAICompanionManager::StartVoiceRecording()
{
	if (VoiceManager)
	{
		VoiceManager->StartRecording();
		UE_LOG(LogTemp, Log, TEXT("[AICompanionManager] Voice recording started"));
	}
}

void AAICompanionManager::StopVoiceRecording()
{
	if (VoiceManager)
	{
		VoiceManager->StopRecording();
		UE_LOG(LogTemp, Log, TEXT("[AICompanionManager] Voice recording stopped"));
	}
}

void AAICompanionManager::AddMemory(const FString& Key, const FString& Value)
{
	if (MemoryManager)
	{
		MemoryManager->AddPreference(Key, Value);
		UE_LOG(LogTemp, Log, TEXT("[AICompanionManager] Memory added: %s = %s"), *Key, *Value);
	}
}

FString AAICompanionManager::GetMemory(const FString& Key)
{
	if (MemoryManager)
	{
		return MemoryManager->GetPreference(Key);
	}
	return TEXT("");
}

void AAICompanionManager::RegisterPlayer()
{
	if (!WebSocketManager || !WebSocketManager->IsConnected())
	{
		UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] Cannot register: Not connected"));
		return;
	}

	UE_LOG(LogTemp, Log, TEXT("[AICompanionManager] Registering player: %s"), *PlayerID);

	// Create registration message
	TSharedPtr<FJsonObject> JsonObject = MakeShareable(new FJsonObject);
	JsonObject->SetStringField(TEXT("type"), TEXT("register"));
	JsonObject->SetStringField(TEXT("playerId"), PlayerID);

	// Convert to string
	FString JsonString;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&JsonString);
	FJsonSerializer::Serialize(JsonObject.ToSharedRef(), Writer);

	// Send registration
	WebSocketManager->SendMessage(JsonString);
}

void AAICompanionManager::HandleWebSocketMessage(const FString& Message)
{
	UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] ✅ HandleWebSocketMessage CALLED!"));
	UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] Raw message: %s"), *Message);
	
	// Parse JSON
	TSharedPtr<FJsonObject> JsonObject;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Message);
	
	if (!FJsonSerializer::Deserialize(Reader, JsonObject))
	{
		UE_LOG(LogTemp, Error, TEXT("[AICompanionManager] Failed to parse message"));
		return;
	}

	FString MessageType;
	if (JsonObject->TryGetStringField(TEXT("type"), MessageType))
	{
		UE_LOG(LogTemp, Log, TEXT("[AICompanionManager] Received message type: %s"), *MessageType);

		if (MessageType == TEXT("connected"))
		{
			FString ClientId;
			JsonObject->TryGetStringField(TEXT("clientId"), ClientId);
			
			UE_LOG(LogTemp, Warning, TEXT("================================================="));
			UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] ✅ CONNECTION CONFIRMED"));
			UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] Client ID: %s"), *ClientId);
			UE_LOG(LogTemp, Warning, TEXT("================================================="));
			
			// Auto-register player
			RegisterPlayer();
		}
		else if (MessageType == TEXT("registered"))
		{
			FString PlayerId;
			JsonObject->TryGetStringField(TEXT("playerId"), PlayerId);
			
			UE_LOG(LogTemp, Warning, TEXT("================================================="));
			UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] ✅ PLAYER REGISTERED"));
			UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] Player ID: %s"), *PlayerId);
			UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] 🎮 READY TO CHAT!"));
			UE_LOG(LogTemp, Warning, TEXT("================================================="));
			
			// Send a test message automatically after 2 seconds
			FTimerHandle TestMessageTimer;
			GetWorld()->GetTimerManager().SetTimer(TestMessageTimer, [this]()
			{
				SendTestMessage(TEXT("Hello from Unreal Engine!"));
			}, 2.0f, false);
		}
		else if (MessageType == TEXT("chat_response"))
		{
			FString ResponseText;
			if (JsonObject->TryGetStringField(TEXT("text"), ResponseText))
			{
				UE_LOG(LogTemp, Warning, TEXT("================================================="));
				UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] 🤖 AI RESPONSE RECEIVED"));
				UE_LOG(LogTemp, Warning, TEXT("================================================="));
				UE_LOG(LogTemp, Display, TEXT("%s"), *ResponseText);
				UE_LOG(LogTemp, Warning, TEXT("================================================="));
				
				// Store in memory
				if (MemoryManager)
				{
					MemoryManager->AddConversation(TEXT("Assistant"), ResponseText, TEXT(""));
				}
				
				// Broadcast to blueprints
				OnAIResponseReceived.Broadcast(ResponseText);
			}
		}
		else if (MessageType == TEXT("voice_processed"))
		{
			FString Transcription;
			FString AIResponse;
			
			JsonObject->TryGetStringField(TEXT("transcription"), Transcription);
			JsonObject->TryGetStringField(TEXT("aiResponse"), AIResponse);
			
			UE_LOG(LogTemp, Warning, TEXT("================================================="));
			UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] 🎤 VOICE PROCESSED"));
			UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] Transcription: %s"), *Transcription);
			if (!AIResponse.IsEmpty())
			{
				UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] AI Response: %s"), *AIResponse);
			}
			UE_LOG(LogTemp, Warning, TEXT("================================================="));
		}
		else if (MessageType == TEXT("error"))
		{
			FString ErrorMsg;
			JsonObject->TryGetStringField(TEXT("error"), ErrorMsg);
			
			UE_LOG(LogTemp, Error, TEXT("================================================="));
			UE_LOG(LogTemp, Error, TEXT("[AICompanionManager] ❌ ERROR FROM BACKEND"));
			UE_LOG(LogTemp, Error, TEXT("[AICompanionManager] Error: %s"), *ErrorMsg);
			UE_LOG(LogTemp, Error, TEXT("================================================="));
		}
		else if (MessageType == TEXT("pong"))
		{
			UE_LOG(LogTemp, Log, TEXT("[AICompanionManager] Pong received (connection alive)"));
		}
		else
		{
			UE_LOG(LogTemp, Log, TEXT("[AICompanionManager] Unhandled message type: %s"), *MessageType);
		}
	}
}

void AAICompanionManager::HandleConnectionStatusChange(bool bConnected)
{
	bIsConnected = bConnected;
	
	if (bConnected)
	{
		UE_LOG(LogTemp, Warning, TEXT("================================================="));
		UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] *** CONNECTED TO BACKEND! ***"));
		UE_LOG(LogTemp, Warning, TEXT("================================================="));
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("================================================="));
		UE_LOG(LogTemp, Warning, TEXT("[AICompanionManager] *** DISCONNECTED FROM BACKEND ***"));
		UE_LOG(LogTemp, Warning, TEXT("================================================="));
	}
	
	OnConnectionStatusChanged.Broadcast(bConnected);
}

void AAICompanionManager::HandleWebSocketError(const FString& ErrorMessage)
{
	UE_LOG(LogTemp, Error, TEXT("================================================="));
	UE_LOG(LogTemp, Error, TEXT("[AICompanionManager] ❌ WEBSOCKET ERROR"));
	UE_LOG(LogTemp, Error, TEXT("[AICompanionManager] Error: %s"), *ErrorMessage);
	UE_LOG(LogTemp, Error, TEXT("================================================="));
	
	// Update connection status
	bIsConnected = false;
	OnConnectionStatusChanged.Broadcast(false);
}

FString AAICompanionManager::GeneratePlayerID()
{
	return FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensInBraces).ToUpper();
}
