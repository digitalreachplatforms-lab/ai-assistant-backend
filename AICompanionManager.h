// AICompanionManager.h - CORRECTED VERSION
// Fixed delegate bindings to match WebSocketManager
// Copy to: D:/Joevisv3v1/Source/Joevisv3v1/AICompanionManager.h

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "WebSocketManager.h"
#include "VoiceManager.h"
#include "MemoryManager.h"
#include "AICompanionManager.generated.h"

// Delegate for AI responses - Use in Blueprints to update UI
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnAIResponseReceived, const FString&, Response);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnConnectionStatusChanged, bool, bIsConnected);

UCLASS()
class JOEVISV3V1_API AAICompanionManager : public AActor
{
	GENERATED_BODY()
	
public:	
	AAICompanionManager();

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

public:	
	virtual void Tick(float DeltaTime) override;

	// ============================================================================
	// CONFIGURATION - PERMANENT RAILWAY URLs (NEVER EXPIRE)
	// ============================================================================
	
	// Permanent HTTP URL - Backend API endpoint
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI Companion|Configuration")
	FString BackendURL = TEXT("https://web-production-e5dfe.up.railway.app");

	// Permanent WebSocket URL - Real-time communication
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI Companion|Configuration")
	FString WebSocketURL = TEXT("wss://web-production-e5dfe.up.railway.app");

	// Auto-connect on BeginPlay
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI Companion|Configuration")
	bool bAutoConnect = true;

	// Enable voice features
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI Companion|Configuration")
	bool bEnableVoice = true;

	// Enable memory system
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI Companion|Configuration")
	bool bEnableMemory = true;

	// ============================================================================
	// STATUS - Read-only status information
	// ============================================================================
	
	UPROPERTY(BlueprintReadOnly, Category = "AI Companion|Status")
	FString PlayerID;

	// ============================================================================
	// MANAGERS - Internal components
	// ============================================================================
	
	UPROPERTY()
	UWebSocketManager* WebSocketManager;

	UPROPERTY()
	UVoiceManager* VoiceManager;

	UPROPERTY()
	UMemoryManager* MemoryManager;

	// ============================================================================
	// EVENTS - Bind these in Blueprints for UI updates
	// ============================================================================
	
	// Fires when AI sends a response - Use to display in UI
	UPROPERTY(BlueprintAssignable, Category = "AI Companion|Events")
	FOnAIResponseReceived OnAIResponseReceived;

	// Fires when connection status changes
	UPROPERTY(BlueprintAssignable, Category = "AI Companion|Events")
	FOnConnectionStatusChanged OnConnectionStatusChanged;

	// ============================================================================
	// PUBLIC FUNCTIONS - Call from Blueprints or C++
	// ============================================================================
	
	// Connect to backend server
	UFUNCTION(BlueprintCallable, Category = "AI Companion")
	void ConnectToBackend();

	// Disconnect from backend server
	UFUNCTION(BlueprintCallable, Category = "AI Companion")
	void DisconnectFromBackend();

	// Check if connected to backend
	UFUNCTION(BlueprintCallable, Category = "AI Companion")
	bool IsConnected() const;

	// Send a chat message to AI
	UFUNCTION(BlueprintCallable, Category = "AI Companion")
	void SendChatMessage(const FString& Message);

	// Send a test message (same as SendChatMessage)
	UFUNCTION(BlueprintCallable, Category = "AI Companion")
	void SendTestMessage(const FString& Message);

	// Start recording voice input
	UFUNCTION(BlueprintCallable, Category = "AI Companion")
	void StartVoiceRecording();

	// Stop recording and process voice
	UFUNCTION(BlueprintCallable, Category = "AI Companion")
	void StopVoiceRecording();

	// Add a memory entry
	UFUNCTION(BlueprintCallable, Category = "AI Companion")
	void AddMemory(const FString& Key, const FString& Value);

	// Retrieve a memory entry
	UFUNCTION(BlueprintCallable, Category = "AI Companion")
	FString GetMemory(const FString& Key);

private:
	// Internal initialization
	void InitializeManagers();
	void RegisterPlayer();
	void HandleWebSocketMessage(const FString& Message);
	void HandleConnectionStatusChange(bool bConnected);
	void HandleWebSocketError(const FString& ErrorMessage);  // ← ADDED: Error handler
	FString GeneratePlayerID();
	
	// Internal state
	bool bIsInitialized = false;
	bool bIsConnected = false;
};
