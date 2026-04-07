# Appendix E - Follow Up User Testing Structured Results Summary

## 1. Dataset Overview

- Raw usable rows in export: **9**
- Marked as finished in CSV: **9**
- Marked as partial in CSV: **0**
- Mean completion time: **1,727 seconds** (approximately **28.8 minutes**)

## 2. Method Summary

Since the last phase, the scheduling interface was redesigned to be more intuitive. Previously, scheduling was treated as a secondary function, hidden within the quiz interface and class interface. Furthermore, rescheduling of quizzes could only be done through the class-specific page, and if a quiz was scheduled for multiple classes, the user would have to go to each individual class page to reschedule. The previous survey also indicated discoverability problems, as teachers reported that they did not know where to find the scheduling interface. As such, the iterations made since the last phase promoted scheduling to a top-level function with a dedicated tab, accessible through the sidebar. The scheduling interface now allows for management of schedules across all classes on a single page. It also allows the easy scheduling of quizzes to multiple classes at once.

The AI generation and gamification features had also been fully implemented, and this secondary testing therefore sought to evaluate the usability of these features, as well as get a sense of teacher opinions on the quality of the generated content.

The main objectives of this secondary testing phase are therefore as follows:

1. Evaluating the new scheduling interface and interactions, especially for rescheduling tasks.
2. Assessing the usability of the AI generation features, as well as the quality of the generated content.
3. Gathering teacher feedback on the student app experience after the inclusion of gamification features, and evaluating the impact of gamification on the student experience.

The survey was once again hosted on Qualtrics, and the prototype platform was self-hosted with pre-created teacher accounts to provide a smooth onboarding experience for participants. The setup was functionally the same as the first phase, but with the prototype platform updated to include the new scheduling interface, as well as the AI generation and gamification features.

The full survey content is provided in **Appendix D (Follow Up User Testing Survey Instrument)**. The survey content was structured similarly to the first phase, with scenario-based sections followed by Likert-scale and open-ended questions.

The following are the three scenarios that were included in this secondary testing phase:

1. **Scenario 1: Scheduling and Rescheduling Quizzes** - The exact same scheduling and rescheduling tasks from the first phase were included in this scenario. The purpose was to evaluate whether the new scheduling interface had improved the usability and discoverability of scheduling features, especially for rescheduling tasks.
2. **Scenario 2: AI Generation of Quiz Content** - This scenario asked teachers to generate quiz content using the AI generation features. Teachers were given the freedom to generate any quiz content they wanted with some constraints on the settings. They were then asked to evaluate the quality of the generated content and provide feedback on the usability of the AI generation features.
3. **Scenario 3: Student App Experience with Gamification** - This scenario showed a video walkthrough of the student app experience after the inclusion of gamification features. Teachers were then asked to evaluate the student experience and provide feedback on the impact of gamification on student engagement and motivation.

Each scenario was followed by a set of Likert-scale questions and open-ended questions to gather quantitative and qualitative feedback.

## 3. Participant Background

### 3.1 Teaching Experience

- `10+`: 4
- `6-10`: 3
- `3-5`: 2

### 3.2 Teaching Levels

- `Primary 6`: 7
- `Primary 5`: 4
- `Primary 4`: 3
- `Primary 3`: 1
- `Primary 1`: 1

Some respondents selected more than one teaching level, so these counts are not mutually exclusive.

### 3.3 Subjects Taught

- `Math`: 6
- `Science`: 4
- `English`: 3
- `Other`: 1

Some respondents selected more than one teaching subject, so these counts are not mutually exclusive.

## 4. Quantitative Results by Survey Block

### 4.1 Scheduling and Rescheduling

- Respondents with data in this block: **9**
- Aggregate mean across block: **4.63 / 5.00**

| Item                                                                         |   n | Mean | Strongly agree | Agree / Somewhat agree | Neither / Disagree |
| ---------------------------------------------------------------------------- | --: | ---: | -------------: | ---------------------: | -----------------: |
| The location for scheduling a quiz was easy to identify.                     |   9 | 5.00 |              9 |                      0 |                  0 |
| The scheduling process was easy to understand without external instructions. |   9 | 4.78 |              7 |                      2 |                  0 |
| The interface guided me naturally through the scheduling process.            |   9 | 4.89 |              8 |                      1 |                  0 |
| Clear feedback was provided when quizzes were scheduled, moved, or updated.  |   9 | 4.33 |              6 |                      2 |                  1 |
| It was easy to adjust or correct a scheduling mistake.                       |   9 | 4.44 |              7 |                      1 |                  1 |
| Rescheduling a quiz was straightforward.                                     |   9 | 4.44 |              7 |                      1 |                  1 |
| I felt confident that my changes to the schedule were saved correctly.       |   9 | 4.56 |              8 |                      0 |                  1 |

![Scheduling and rescheduling item means](figures/generated-figures/annex-i-scheduling-and-rescheduling-items.svg)

_Figure E.1. Mean scores for the individual scheduling and rescheduling items in the follow-up user test._

### 4.2 AI Quiz Generation Interface

- Aggregate mean across block: **4.85 / 5.00**

| Item                                                                                           |   n | Mean | Strongly agree | Agree / Somewhat agree | Neither / Disagree |
| ---------------------------------------------------------------------------------------------- | --: | ---: | -------------: | ---------------------: | -----------------: |
| The location of the AI quiz generation feature was easy to identify.                           |   9 | 4.89 |              8 |                      1 |                  0 |
| The AI generation interface was easy to understand without external instructions.              |   9 | 4.89 |              8 |                      1 |                  0 |
| The available generation settings (subject, level, instructions, etc.) were clearly presented. |   9 | 4.78 |              7 |                      2 |                  0 |
| It was easy to configure the settings needed to generate a quiz.                               |   9 | 4.89 |              8 |                      1 |                  0 |
| The process of generating quizzes using the AI tool was straightforward.                       |   9 | 4.78 |              7 |                      2 |                  0 |
| The system clearly indicated when quiz generation was in progress or successful.               |   9 | 4.89 |              8 |                      1 |                  0 |

![AI quiz generation interface item means](figures/generated-figures/annex-i-ai-quiz-generation-interface-items.svg)

_Figure E.2. Mean scores for the individual AI quiz generation interface items in the follow-up user test._

### 4.3 AI Generated Output

- Aggregate mean across block: **4.40 / 5.00**

| Item                                                                                              |   n | Mean | Strongly agree | Agree / Somewhat agree | Neither / Disagree |
| ------------------------------------------------------------------------------------------------- | --: | ---: | -------------: | ---------------------: | -----------------: |
| The generated quizzes followed the topic or instructions that I provided.                         |   9 | 4.56 |              5 |                      4 |                  0 |
| The difficulty level of the generated questions was appropriate for the selected education level. |   9 | 4.11 |              3 |                      5 |                  1 |
| The generated questions appeared factually correct.                                               |   9 | 4.56 |              5 |                      4 |                  0 |
| The answer options and correct answers were unambiguous.                                          |   9 | 4.33 |              3 |                      6 |                  0 |
| The questions did not feel repetitive.                                                            |   9 | 4.44 |              4 |                      5 |                  0 |

![AI generated output item means](figures/generated-figures/annex-i-ai-generated-output-items.svg)

_Figure E.3. Mean scores for the individual AI-generated output items in the follow-up user test._

### 4.4 Gamification Review

- Aggregate mean across block: **4.67 / 5.00**

| Item                                                                                      |   n | Mean | Strongly agree | Agree / Somewhat agree | Neither / Disagree |
| ----------------------------------------------------------------------------------------- | --: | ---: | -------------: | ---------------------: | -----------------: |
| The avatar customisation system would motivate students to participate more consistently. |   9 | 4.44 |              4 |                      5 |                  0 |
| The leaderboard system would encourage students to participate more consistently.         |   9 | 4.78 |              7 |                      2 |                  0 |
| The badge system would motivate students to participate more consistently.                |   9 | 4.56 |              5 |                      4 |                  0 |
| Overall, the reward systems shown would make quiz practice more engaging for students.    |   9 | 4.67 |              6 |                      3 |                  0 |
| The gamification elements shown are appropriate for primary school students.              |   9 | 4.78 |              7 |                      2 |                  0 |
| The competitive elements (leaderboards) are suitable for a classroom environment.         |   9 | 4.78 |              7 |                      2 |                  0 |

![Gamification review item means](figures/generated-figures/annex-i-gamification-review-items.svg)

_Figure E.4. Mean scores for the individual gamification-review items in the follow-up user test._

## 5. Open-Ended Responses

### 5.1 Scheduling and Rescheduling

**What parts of the scheduling process felt unclear or unintuitive (if any)?**

- nil
- Initial instinct when attempting to edit a scheduled quiz was to left click on the quiz instead of right click.
- i was stuck at the scheduling pop out box. after filling up all the info, the process was stopped with no buttons to submit etc. Maybe at the scheduling page, the selection of the quizzes can add the check box on the left.
- NIL, all parts were quite clear and guided.
- Not sure if it was just my computer, but the 'schedule' button to click when scheduling a quiz cannot be seen when the browser zoom was at 100%. I needed to zoom out to 80% to be able to see and click on the button.
- This scheduling interface is much better than in the previous iteration of the app. It was much easier to locate and clearer to use
- Perhaps the only unclear part to me personally is the the schedule button under the "Quizzes" tab. Currently it is a calendar icon with a plus sign at the lower right corner. The add sign made me think about adding a date into the calendar, which took me an additional step to relate it to scheduling a quiz. Personal opinion, maybe use an arrow pointing from left to right to replace the plus sign and place the arrow at the lower left corner of the calendar icon? This way there is a visual cue to the use that this is to assign something into/onto the calendar? When trying to trace where I formed this understanding, maybe it is from SLS? When assigning an assignment, it is an arrow pointing from left to right...which carries a notion/perception of assigning something from the lesson resource bank to the students.
- I seem to have trouble to assign the quiz after I have chosen the scheduling details.
- The popup for keying in the details for scheduling a quiz did not facilitate scrolling. I had to zoom out of the page using ctrl - to see the schedule button at the bottom. I forsee that this could be a recurring issue for other teachers as well, since our school issued laptops have rather small screens. Other than that, everything was very well organised and easy to follow.

**Are there any real classroom or school constraints that might make scheduling quizzes difficult using this system?**

- nil
- it seems easy and should not be any issue. Its just that the scheduling process wasnt able to be completed. thanks
- Not really! Perhaps instead of a horizontal scrolling to reveal upcoming dates, a calendar view may be more helpful as teachers often assign based on weeks.
- Not if there are already template quizzes we can use. The simplicity of the student login process should also be a consideration.
- Not any I can think of.
- No. It should be quite straight forward.
- No, seems to be quite straightforward

### 5.2 AI Quiz Generation

**What parts of the AI quiz generation process felt unclear or unintuitive (if any)?**

- Not too sure how specific the prompts had to be, given only one generation allowed.
- nilo
- NIL
- nil
- If the aim of this platform is to help teachers ease the workload, perhaps can make the button to generate quiz questions using AI more exciting? Currently "Create New Quiz" is blue colour and "Generate Quizzes with AI" is plain black, which is the same as the webpage background colour...which can be easily missed out...How about swap the colour scheme of the two buttons, at least make the AI button more attractive? Can also consider adding a little magic wand or little robot icon next to the words "Generate Quizzes with AI" on the button, so it is visually more straightforward and will excite teacher users.
- Nil
- Nothing, the generation process was quite easy to use

**Were there any issues with the generated quizzes (e.g., incorrect answers, unclear questions, inappropriate difficulty)?**

- Unclear wordings of questions that may not be in the language that is familiar to the students. Good that the generated quizzes can be further edited by the teacher.
- There were questions that used terminology not seen in a Singaporean context.
- some generated questions are not phrases in the usual way. eg. we do not ask the students to know the word class. etc
- NIL
- There were 2 possible answers generated for one of the questions (P6 Math word problems), which were [500 + 50 - 125] and [500 - 125 + 50] but the AI question only indicated [500 - 125 + 50] as the correct answer.

  Also, the questions seemed too simple. These will be good for lower progress students who need help but they won't be useful for the mid and higher progress students.

- I generated questions on fractions and decimals for primary 4 students. It seems like the quizzes are unable to display fractions in the usual form that students are used to. For example, there was a question that was generated with "1 and 1/2" which likely referred to a mixed fraction. Perhaps there needs to be better support for mathematical notations.
- Not any.
- Nil
- The quizzes seems to be quite limited in content difficulty. I generated questions for Primary 6 Science, and the generated content does indeed use primary 6 content, but questions are quite surface level, mostly recall based questions rather than any application ones. The AI generation seems to also lack in images. Many p6 science questions have attached images or graphs in the questions and the students are expected to explain certain patterns or behaviour given the images. Perhaps the AI could somehow be prompted to generate questions with more variation?

**What improvements would you suggest for the AI quiz generation feature (if any)?**

- It would be good for the system to allow finetuning of quiz items by giving follow-up prompts to the AI platform.
- no. its great to be able to edit the generated quiz.
- There could be an option to use pre-uploaded documents, instead of needing to upload a reference document every time quizzes are created. Not sure if it is possible!
- Nothing really, the overall experience was quite straightforward and other than some formatting issues, the generated quizzes were of usable quality.
- Refer to Question 1.
- Most questions seem to be quite easy.
- Mentioned above^

### 5.3 Gamification Review

**Do you think the gamification features shown would motivate students to complete quizzes regularly? Why or why not?**

- Generally, students like things of a competitive nature. The idea of having a leaderboard is good.
- Leaderboards seem like a good idea due to the competitive nature of them. Can see the avatar/badge element being fun due to the social aspect of it, but not too sure how well received it would be.
- competitive nature is good
- Yes, as students who are not intrinsically motivated may be engaged to complete quizzes regularly to reach the top of the leaderboard.
- It would increase the likelihood, but it all depends on individual students' motivations.
- Personally, I don't have the best experience with using leaderboards as a form of motivation. I noticed that weaker students have a tendency to give up when they see no hope is moving up the leaderboard
- Generally students are observed to be interested in customising their game avatar at the beginning, but the effect diminishes gradually.
  Gamification taps on human motivation and a leader board does do that trick to some extent.
- Yes. It gives additional motivation for students to progress to the next step/stage.
- These seem like features that the children would enjoy using

**Do you have any concerns about the gamification features shown?**

- no
- You may wish to consider adding non-skin tone colours for the avatar customisation.
- I think skin colour should be something that they are given the choice without needing to win / complete anything. If not, there may be a perceived inequality of which skin colour is the default colour of the avatar.
- Mentioned above
- Not any.
- Nil
- nil

**What improvements or additional features would you suggest for the gamification system (if any)?**

- Can consider allowing students to purchase accessories from a shop vs them scoring items at random.
- These features feel very detatched from the app's main purpose which are the quizzes. Perhaps the quizzes themselves can be more "gamified" rather than having gamification features which seem to be a seperate element altogether.
- perhaps change the pictures to reflect the differences between the categories. eg. highest streak vs highest participation
- Will teachers be allowed to award students badges? This would be useful as a reward system.
- Looking at how KooBits succeeded in this area, they tried to tie students' achivements in the virtual online platform to something physical that students can obtain, such as mailig the medals to the primary schools and teachers can announce it and present the medal in front of the whole class/school, which does further boost students' motivation.
- Nil
- nil

### 5.4 Other Feedback

- nil
- my first task was incomplete as my page was stuck at the scheduling
- NIL. There are many positive and useful changes!
- Not any at the moment.
