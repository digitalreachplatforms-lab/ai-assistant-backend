// CalendarDialogueComponent.cpp
// Implementation of calendar dialogue handling

#include "CalendarDialogueComponent.h"
#include "AICompanionManager.h"
#include "Kismet/GameplayStatics.h"

UCalendarDialogueComponent::UCalendarDialogueComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
	CurrentState = ECalendarDialogueState::Idle;
}

void UCalendarDialogueComponent::BeginPlay()
{
	Super::BeginPlay();
	LogCalendar("Calendar Dialogue Component initialized");
}

void UCalendarDialogueComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
}

// ========================================
// PUBLIC API IMPLEMENTATION
// ========================================

void UCalendarDialogueComponent::StartEventCreation()
{
	LogCalendar("Starting calendar event creation flow");
	
	// Reset event data
	EventData = FCalendarEventData();
	EventData.bIsValid = false;
	
	// Start flow
	CurrentState = ECalendarDialogueState::AskingEventName;
	AskCurrentQuestion();
}

void UCalendarDialogueComponent::ProcessUserResponse(const FString& Response)
{
	if (CurrentState == ECalendarDialogueState::Idle)
	{
		LogCalendar("Received response but not in calendar flow - ignoring", true);
		return;
	}

	LogCalendar(FString::Printf(TEXT("Processing response in state %d: %s"), 
		(int32)CurrentState, *Response));

	// Process answer based on current state
	bool bSuccess = ProcessAnswer(Response);

	if (bSuccess)
	{
		// Move to next question
		AdvanceToNextState();
	}
	else
	{
		// Invalid answer, ask again
		LogCalendar("Invalid answer, asking again", true);
		AskCurrentQuestion();
	}
}

void UCalendarDialogueComponent::CancelFlow()
{
	LogCalendar("Calendar flow cancelled");
	CurrentState = ECalendarDialogueState::Idle;
	EventData = FCalendarEventData();
	OnFlowCancelled.Broadcast();
}

// ========================================
// CONVERSATION FLOW
// ========================================

void UCalendarDialogueComponent::AdvanceToNextState()
{
	switch (CurrentState)
	{
	case ECalendarDialogueState::AskingEventName:
		CurrentState = ECalendarDialogueState::AskingDateTime;
		break;
	case ECalendarDialogueState::AskingDateTime:
		CurrentState = ECalendarDialogueState::AskingDuration;
		break;
	case ECalendarDialogueState::AskingDuration:
		CurrentState = ECalendarDialogueState::AskingLocation;
		break;
	case ECalendarDialogueState::AskingLocation:
		CurrentState = ECalendarDialogueState::AskingNotes;
		break;
	case ECalendarDialogueState::AskingNotes:
		CurrentState = ECalendarDialogueState::AskingPriority;
		break;
	case ECalendarDialogueState::AskingPriority:
		CurrentState = ECalendarDialogueState::Confirming;
		break;
	case ECalendarDialogueState::Confirming:
		CurrentState = ECalendarDialogueState::Creating;
		SendEventToBackend();
		CurrentState = ECalendarDialogueState::Complete;
		CurrentState = ECalendarDialogueState::Idle; // Reset for next time
		return;
	default:
		CurrentState = ECalendarDialogueState::Idle;
		return;
	}

	// Ask next question
	AskCurrentQuestion();
}

void UCalendarDialogueComponent::AskCurrentQuestion()
{
	FString Question;

	switch (CurrentState)
	{
	case ECalendarDialogueState::AskingEventName:
		Question = TEXT("What would you like to call this event?");
		break;
	case ECalendarDialogueState::AskingDateTime:
		Question = TEXT("When would you like to schedule it? (e.g., 'tomorrow at 2pm', 'November 5 at 3:30pm')");
		break;
	case ECalendarDialogueState::AskingDuration:
		Question = TEXT("How long will it take? (e.g., '1 hour', '30 minutes')");
		break;
	case ECalendarDialogueState::AskingLocation:
		Question = TEXT("Where will this take place? (or say 'none')");
		break;
	case ECalendarDialogueState::AskingNotes:
		Question = TEXT("Any notes or details? (or say 'none')");
		break;
	case ECalendarDialogueState::AskingPriority:
		Question = TEXT("How important is this event? (1-10, where 10 is most important)");
		break;
	case ECalendarDialogueState::Confirming:
		Question = GenerateConfirmationMessage();
		break;
	default:
		return;
	}

	LogCalendar(FString::Printf(TEXT("Asking: %s"), *Question));
	OnAskQuestion.Broadcast(Question);
}

bool UCalendarDialogueComponent::ProcessAnswer(const FString& Answer)
{
	switch (CurrentState)
	{
	case ECalendarDialogueState::AskingEventName:
		return ProcessEventName(Answer);
	case ECalendarDialogueState::AskingDateTime:
		return ProcessDateTime(Answer);
	case ECalendarDialogueState::AskingDuration:
		return ProcessDuration(Answer);
	case ECalendarDialogueState::AskingLocation:
		return ProcessLocation(Answer);
	case ECalendarDialogueState::AskingNotes:
		return ProcessNotes(Answer);
	case ECalendarDialogueState::AskingPriority:
		return ProcessPriority(Answer);
	case ECalendarDialogueState::Confirming:
		return ProcessConfirmation(Answer);
	default:
		return false;
	}
}

// ========================================
// ANSWER PROCESSORS
// ========================================

bool UCalendarDialogueComponent::ProcessEventName(const FString& Answer)
{
	if (Answer.IsEmpty() || Answer.Len() < 2)
	{
		return false;
	}

	EventData.EventName = Answer.TrimStartAndEnd();
	LogCalendar(FString::Printf(TEXT("Event name set: %s"), *EventData.EventName));
	return true;
}

bool UCalendarDialogueComponent::ProcessDateTime(const FString& Answer)
{
	FDateTime ParsedDateTime = ParseDateTime(Answer);
	
	if (ParsedDateTime == FDateTime::MinValue())
	{
		return false;
	}

	EventData.DateTime = ParsedDateTime;
	LogCalendar(FString::Printf(TEXT("DateTime set: %s"), *EventData.DateTime.ToString()));
	return true;
}

bool UCalendarDialogueComponent::ProcessDuration(const FString& Answer)
{
	int32 Minutes = ParseDuration(Answer);
	
	if (Minutes <= 0)
	{
		return false;
	}

	EventData.DurationMinutes = Minutes;
	LogCalendar(FString::Printf(TEXT("Duration set: %d minutes"), EventData.DurationMinutes));
	return true;
}

bool UCalendarDialogueComponent::ProcessLocation(const FString& Answer)
{
	FString Trimmed = Answer.TrimStartAndEnd().ToLower();
	
	if (Trimmed == TEXT("none") || Trimmed == TEXT("no") || Trimmed == TEXT("skip"))
	{
		EventData.Location = TEXT("");
		LogCalendar("Location: none");
	}
	else
	{
		EventData.Location = Answer.TrimStartAndEnd();
		LogCalendar(FString::Printf(TEXT("Location set: %s"), *EventData.Location));
	}
	
	return true; // Always succeeds
}

bool UCalendarDialogueComponent::ProcessNotes(const FString& Answer)
{
	FString Trimmed = Answer.TrimStartAndEnd().ToLower();
	
	if (Trimmed == TEXT("none") || Trimmed == TEXT("no") || Trimmed == TEXT("skip"))
	{
		EventData.Notes = TEXT("");
		LogCalendar("Notes: none");
	}
	else
	{
		EventData.Notes = Answer.TrimStartAndEnd();
		LogCalendar(FString::Printf(TEXT("Notes set: %s"), *EventData.Notes));
	}
	
	return true; // Always succeeds
}

bool UCalendarDialogueComponent::ProcessPriority(const FString& Answer)
{
	int32 Priority = ExtractNumber(Answer);
	
	if (Priority < 1 || Priority > 10)
	{
		return false;
	}

	EventData.Priority = Priority;
	LogCalendar(FString::Printf(TEXT("Priority set: %d"), EventData.Priority));
	return true;
}

bool UCalendarDialogueComponent::ProcessConfirmation(const FString& Answer)
{
	bool bConfirmed = IsAffirmative(Answer);
	
	if (!bConfirmed)
	{
		LogCalendar("Event creation cancelled by user");
		CancelFlow();
		return false;
	}

	LogCalendar("Event confirmed by user");
	EventData.bIsValid = true;
	return true;
}

// ========================================
// HELPERS
// ========================================

FDateTime UCalendarDialogueComponent::ParseDateTime(const FString& Input)
{
	FString Lower = Input.ToLower().TrimStartAndEnd();
	FDateTime Now = FDateTime::Now();
	FDateTime Result = FDateTime::MinValue();

	// Simple parsing - extend this for more complex cases
	
	// "tomorrow at 2pm"
	if (Lower.Contains(TEXT("tomorrow")))
	{
		Result = Now + FTimespan::FromDays(1);
		
		// Extract time
		if (Lower.Contains(TEXT("at")))
		{
			int32 Hour = 12; // Default noon
			
			if (Lower.Contains(TEXT("pm")))
			{
				Hour = ExtractNumber(Lower);
				if (Hour < 12) Hour += 12;
			}
			else if (Lower.Contains(TEXT("am")))
			{
				Hour = ExtractNumber(Lower);
			}
			
			Result = FDateTime(Result.GetYear(), Result.GetMonth(), Result.GetDay(), Hour, 0, 0);
		}
		
		return Result;
	}
	
	// "today at 3pm"
	if (Lower.Contains(TEXT("today")))
	{
		Result = Now;
		
		if (Lower.Contains(TEXT("at")))
		{
			int32 Hour = 12;
			
			if (Lower.Contains(TEXT("pm")))
			{
				Hour = ExtractNumber(Lower);
				if (Hour < 12) Hour += 12;
			}
			else if (Lower.Contains(TEXT("am")))
			{
				Hour = ExtractNumber(Lower);
			}
			
			Result = FDateTime(Result.GetYear(), Result.GetMonth(), Result.GetDay(), Hour, 0, 0);
		}
		
		return Result;
	}

	// TODO: Add more complex parsing (specific dates, times, etc.)
	// For now, return invalid if we can't parse
	
	LogCalendar(FString::Printf(TEXT("Could not parse datetime: %s"), *Input), true);
	return FDateTime::MinValue();
}

int32 UCalendarDialogueComponent::ParseDuration(const FString& Input)
{
	FString Lower = Input.ToLower().TrimStartAndEnd();
	int32 Number = ExtractNumber(Lower);

	if (Number <= 0)
	{
		return 0;
	}

	// Check units
	if (Lower.Contains(TEXT("hour")))
	{
		return Number * 60; // Convert to minutes
	}
	else if (Lower.Contains(TEXT("minute")) || Lower.Contains(TEXT("min")))
	{
		return Number;
	}
	else
	{
		// Assume minutes if no unit specified
		return Number;
	}
}

int32 UCalendarDialogueComponent::ExtractNumber(const FString& Input)
{
	// Extract first number from string
	FString NumberStr;
	
	for (TCHAR Char : Input)
	{
		if (FChar::IsDigit(Char))
		{
			NumberStr.AppendChar(Char);
		}
		else if (!NumberStr.IsEmpty())
		{
			// Found number, stop
			break;
		}
	}

	if (NumberStr.IsEmpty())
	{
		return 0;
	}

	return FCString::Atoi(*NumberStr);
}

bool UCalendarDialogueComponent::IsAffirmative(const FString& Answer)
{
	FString Lower = Answer.ToLower().TrimStartAndEnd();
	
	return Lower == TEXT("yes") ||
	       Lower == TEXT("yeah") ||
	       Lower == TEXT("yep") ||
	       Lower == TEXT("sure") ||
	       Lower == TEXT("ok") ||
	       Lower == TEXT("okay") ||
	       Lower == TEXT("y") ||
	       Lower == TEXT("confirm") ||
	       Lower == TEXT("correct") ||
	       Lower == TEXT("right");
}

FString UCalendarDialogueComponent::GenerateConfirmationMessage() const
{
	FString Message = TEXT("Here's what I have:\n\n");
	Message += FString::Printf(TEXT("📅 %s\n"), *EventData.EventName);
	Message += FString::Printf(TEXT("⏰ %s\n"), *EventData.DateTime.ToString(TEXT("%B %d, %Y at %I:%M %p")));
	Message += FString::Printf(TEXT("⏱️ Duration: %d minutes\n"), EventData.DurationMinutes);
	
	if (!EventData.Location.IsEmpty())
	{
		Message += FString::Printf(TEXT("📍 %s\n"), *EventData.Location);
	}
	
	if (!EventData.Notes.IsEmpty())
	{
		Message += FString::Printf(TEXT("📝 %s\n"), *EventData.Notes);
	}
	
	Message += FString::Printf(TEXT("⭐ Priority: %d/10\n\n"), EventData.Priority);
	Message += TEXT("Should I create this event?");
	
	return Message;
}

void UCalendarDialogueComponent::SendEventToBackend()
{
	LogCalendar("Sending event to backend...");
	
	// Find AICompanionManager
	TArray<AActor*> FoundActors;
	UGameplayStatics::GetAllActorsOfClass(GetWorld(), AAICompanionManager::StaticClass(), FoundActors);
	
	if (FoundActors.Num() == 0)
	{
		LogCalendar("ERROR: Could not find AICompanionManager!", true);
		return;
	}

	AAICompanionManager* Manager = Cast<AAICompanionManager>(FoundActors[0]);
	if (!Manager)
	{
		LogCalendar("ERROR: Failed to cast to AICompanionManager!", true);
		return;
	}

	// Build JSON message
	FString JSON = TEXT("{");
	JSON += FString::Printf(TEXT("\"type\":\"create_calendar_event\","));
	JSON += FString::Printf(TEXT("\"eventName\":\"%s\","), *EventData.EventName);
	JSON += FString::Printf(TEXT("\"dateTime\":\"%s\","), *EventData.DateTime.ToIso8601());
	JSON += FString::Printf(TEXT("\"durationMinutes\":%d,"), EventData.DurationMinutes);
	JSON += FString::Printf(TEXT("\"location\":\"%s\","), *EventData.Location);
	JSON += FString::Printf(TEXT("\"notes\":\"%s\","), *EventData.Notes);
	JSON += FString::Printf(TEXT("\"priority\":%d"), EventData.Priority);
	JSON += TEXT("}");

	// Send via AICompanionManager
	Manager->SendMessageToBackend(JSON);

	LogCalendar("Event sent to backend successfully");
	
	// Broadcast completion
	OnEventCreated.Broadcast(EventData);
}

void UCalendarDialogueComponent::LogCalendar(const FString& Message, bool bWarning)
{
	if (bWarning)
	{
		UE_LOG(LogTemp, Warning, TEXT("[CalendarDialogue] %s"), *Message);
	}
	else
	{
		UE_LOG(LogTemp, Log, TEXT("[CalendarDialogue] %s"), *Message);
	}
}
