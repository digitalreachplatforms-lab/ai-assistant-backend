// CalendarDialogueComponent.h
// Handles calendar event creation through natural AI conversation
// AI asks questions, this component manages the flow and stores answers

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "CalendarDialogueComponent.generated.h"

/**
 * Calendar conversation states
 */
UENUM(BlueprintType)
enum class ECalendarDialogueState : uint8
{
	Idle UMETA(DisplayName = "Idle"),
	AskingEventName UMETA(DisplayName = "Asking Event Name"),
	AskingDateTime UMETA(DisplayName = "Asking Date/Time"),
	AskingDuration UMETA(DisplayName = "Asking Duration"),
	AskingLocation UMETA(DisplayName = "Asking Location"),
	AskingNotes UMETA(DisplayName = "Asking Notes"),
	AskingPriority UMETA(DisplayName = "Asking Priority"),
	Confirming UMETA(DisplayName = "Confirming"),
	Creating UMETA(DisplayName = "Creating Event"),
	Complete UMETA(DisplayName = "Complete")
};

/**
 * Calendar event data structure
 */
USTRUCT(BlueprintType)
struct FCalendarEventData
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite)
	FString EventName;

	UPROPERTY(BlueprintReadWrite)
	FDateTime DateTime;

	UPROPERTY(BlueprintReadWrite)
	int32 DurationMinutes = 60;

	UPROPERTY(BlueprintReadWrite)
	FString Location;

	UPROPERTY(BlueprintReadWrite)
	FString Notes;

	UPROPERTY(BlueprintReadWrite)
	int32 Priority = 5;

	UPROPERTY(BlueprintReadWrite)
	bool bIsValid = false;
};

/**
 * Component that handles calendar event creation through AI conversation
 * 
 * Usage:
 * 1. User says "Schedule my dentist appointment"
 * 2. AI responds "What would you like to call this event?"
 * 3. This component detects we're in calendar flow
 * 4. Manages conversation state and stores answers
 * 5. When complete, sends event to backend
 */
UCLASS(ClassGroup=(Custom), meta=(BlueprintSpawnableComponent))
class JOEVISV3V1_API UCalendarDialogueComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UCalendarDialogueComponent();

protected:
	virtual void BeginPlay() override;

public:
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	// ========================================
	// PUBLIC API
	// ========================================

	/**
	 * Start a new calendar event creation flow
	 * Call this when user says "schedule", "create event", etc.
	 */
	UFUNCTION(BlueprintCallable, Category = "Calendar")
	void StartEventCreation();

	/**
	 * Process user's response to current question
	 * Call this when user provides an answer
	 */
	UFUNCTION(BlueprintCallable, Category = "Calendar")
	void ProcessUserResponse(const FString& Response);

	/**
	 * Cancel current calendar flow
	 */
	UFUNCTION(BlueprintCallable, Category = "Calendar")
	void CancelFlow();

	/**
	 * Get current conversation state
	 */
	UFUNCTION(BlueprintPure, Category = "Calendar")
	ECalendarDialogueState GetCurrentState() const { return CurrentState; }

	/**
	 * Get current event data (partial or complete)
	 */
	UFUNCTION(BlueprintPure, Category = "Calendar")
	FCalendarEventData GetEventData() const { return EventData; }

	/**
	 * Is currently in calendar conversation?
	 */
	UFUNCTION(BlueprintPure, Category = "Calendar")
	bool IsInCalendarFlow() const { return CurrentState != ECalendarDialogueState::Idle; }

	// ========================================
	// DELEGATES (Events)
	// ========================================

	/**
	 * Fired when AI should ask next question
	 * Connect this to your AI chat system
	 */
	DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnAskQuestion, const FString&, Question);
	UPROPERTY(BlueprintAssignable, Category = "Calendar")
	FOnAskQuestion OnAskQuestion;

	/**
	 * Fired when event creation is complete
	 * Send this data to backend
	 */
	DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnEventCreated, const FCalendarEventData&, EventData);
	UPROPERTY(BlueprintAssignable, Category = "Calendar")
	FOnEventCreated OnEventCreated;

	/**
	 * Fired when flow is cancelled
	 */
	DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnFlowCancelled);
	UPROPERTY(BlueprintAssignable, Category = "Calendar")
	FOnFlowCancelled OnFlowCancelled;

private:
	// ========================================
	// INTERNAL STATE
	// ========================================

	UPROPERTY()
	ECalendarDialogueState CurrentState;

	UPROPERTY()
	FCalendarEventData EventData;

	// ========================================
	// CONVERSATION FLOW
	// ========================================

	/** Move to next question in flow */
	void AdvanceToNextState();

	/** Ask current question based on state */
	void AskCurrentQuestion();

	/** Validate and store user's answer */
	bool ProcessAnswer(const FString& Answer);

	// ========================================
	// ANSWER PROCESSORS
	// ========================================

	bool ProcessEventName(const FString& Answer);
	bool ProcessDateTime(const FString& Answer);
	bool ProcessDuration(const FString& Answer);
	bool ProcessLocation(const FString& Answer);
	bool ProcessNotes(const FString& Answer);
	bool ProcessPriority(const FString& Answer);
	bool ProcessConfirmation(const FString& Answer);

	// ========================================
	// HELPERS
	// ========================================

	/** Parse natural language date/time (e.g., "tomorrow at 2pm") */
	FDateTime ParseDateTime(const FString& Input);

	/** Parse duration (e.g., "1 hour", "30 minutes") */
	int32 ParseDuration(const FString& Input);

	/** Extract number from string */
	int32 ExtractNumber(const FString& Input);

	/** Check if answer is affirmative (yes, yeah, sure, etc.) */
	bool IsAffirmative(const FString& Answer);

	/** Generate confirmation message */
	FString GenerateConfirmationMessage() const;

	/** Send event to backend */
	void SendEventToBackend();

	/** Log calendar activity */
	void LogCalendar(const FString& Message, bool bWarning = false);
};
