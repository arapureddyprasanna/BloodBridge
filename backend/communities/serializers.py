from django.db.models import Avg
from django.utils import timezone

from rest_framework import serializers

from accounts.models import (
    User,
    VerificationApplication,
    VerificationDocument,
)

from .models import (
    Community,
    CommunityAnnouncement,
    CommunityBloodRequestShare,
    CommunityReview,
    DonationCamp,
    DonationCampRegistration,
    DonorCommunityApplication,
)
from matching.services import is_donor_available


class CommunityMemberDirectorySerializer(serializers.ModelSerializer):
    donor_id = serializers.UUIDField(read_only=True)
    donor_name = serializers.CharField(source="donor.full_name", read_only=True)
    donor_email = serializers.EmailField(source="donor.email", read_only=True)
    donor_phone = serializers.CharField(source="donor.mobile_number", read_only=True)
    blood_group = serializers.SerializerMethodField()
    availability = serializers.SerializerMethodField()
    sharing_preference = serializers.SerializerMethodField()

    class Meta:
        model = DonorCommunityApplication
        fields = ["id", "donor_id", "donor_name", "donor_email", "donor_phone", "blood_group", "availability", "sharing_preference", "status", "reviewed_at"]

    def get_blood_group(self, obj):
        profile = getattr(obj.donor, "donor_profile", None)
        return profile.blood_group if profile else None

    def get_availability(self, obj):
        profile = getattr(obj.donor, "donor_profile", None)
        if profile is None or not profile.community_visibility:
            return "private"
        return "available" if is_donor_available(profile) else "unavailable"

    def get_sharing_preference(self, obj):
        profile = getattr(obj.donor, "donor_profile", None)
        return "shared with community" if profile and profile.community_visibility else "not shared"


class CommunityAnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommunityAnnouncement
        fields = ["id", "community", "title", "message", "audience", "publication_date", "status", "is_pinned", "published_at", "created_at", "updated_at"]
        read_only_fields = ["id", "community", "status", "is_pinned", "published_at", "created_at", "updated_at"]

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("A title is required.")
        return value

    def validate_message(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("A message is required.")
        return value


class DonationCampSerializer(serializers.ModelSerializer):
    community = serializers.PrimaryKeyRelatedField(read_only=True)
    organizer = serializers.CharField(source="community.admin.full_name", read_only=True)
    registered_count = serializers.SerializerMethodField()
    available_places = serializers.SerializerMethodField()

    class Meta:
        model = DonationCamp
        fields = ["id", "community", "title", "description", "starts_at", "venue", "city", "organizer", "capacity", "registered_count", "available_places", "registration_open", "status", "created_at", "updated_at"]
        read_only_fields = ["id", "community", "organizer", "registered_count", "available_places", "status", "created_at", "updated_at"]

    def get_registered_count(self, obj):
        return obj.registrations.filter(status=DonationCampRegistration.Status.REGISTERED).count()

    def get_available_places(self, obj):
        return max(0, obj.capacity - self.get_registered_count(obj))

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("Capacity must be at least one.")
        instance = getattr(self, "instance", None)
        if instance and value < instance.registrations.filter(status=DonationCampRegistration.Status.REGISTERED).count():
            raise serializers.ValidationError("Capacity cannot be lower than the current registered count.")
        return value

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("A camp title is required.")
        return value

    def validate_venue(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("A venue is required.")
        return value

    def validate_starts_at(self, value):
        if self.instance is None and value <= timezone.now():
            raise serializers.ValidationError("A new camp must be scheduled in the future.")
        return value


class CommunityBloodRequestShareSerializer(serializers.ModelSerializer):
    request_id = serializers.UUIDField(source="blood_request_id", read_only=True)
    hospital_name = serializers.SerializerMethodField()
    hospital_city = serializers.SerializerMethodField()
    blood_group = serializers.CharField(source="blood_request.blood_group", read_only=True)
    units_required = serializers.IntegerField(source="blood_request.units_required", read_only=True)
    urgency = serializers.CharField(source="blood_request.urgency", read_only=True)
    request_status = serializers.CharField(source="blood_request.status", read_only=True)
    required_by = serializers.DateTimeField(source="blood_request.required_by", read_only=True)
    eligible_member_count = serializers.SerializerMethodField()
    invitation_counts = serializers.SerializerMethodField()

    class Meta:
        model = CommunityBloodRequestShare
        fields = ["id", "request_id", "hospital_name", "hospital_city", "blood_group", "units_required", "urgency", "request_status", "required_by", "shared_at", "eligible_member_count", "invitation_counts"]

    def get_eligible_member_count(self, obj):
        return self.context.get("eligible_counts", {}).get(str(obj.blood_request_id), 0)

    def get_hospital_name(self, obj):
        try:
            return obj.blood_request.hospital.hospital_profile.hospital_name
        except Exception:
            return obj.blood_request.hospital.full_name

    def get_hospital_city(self, obj):
        try:
            return obj.blood_request.hospital.hospital_profile.city
        except Exception:
            return ""

    def get_invitation_counts(self, obj):
        return self.context.get("invitation_counts", {}).get(str(obj.blood_request_id), {"pending": 0, "accepted": 0, "declined": 0})


class DonationCampRegistrationSerializer(serializers.ModelSerializer):
    donor_name = serializers.CharField(source="donor.full_name", read_only=True)

    class Meta:
        model = DonationCampRegistration
        fields = ["id", "donor_name", "status", "created_at"]
        read_only_fields = fields


class CommunityListSerializer(serializers.ModelSerializer):
    rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    logo = serializers.SerializerMethodField()

    class Meta:
        model = Community
        fields = [
            "id",
            "name",
            "description",
            "logo",
            "city",
            "state",
            "rating",
            "review_count",
            "member_count",
        ]

    def get_logo(self, obj):
        if not obj.logo:
            return None

        request = self.context.get("request")
        url = obj.logo.url

        return (
            request.build_absolute_uri(url)
            if request
            else url
        )

    def get_rating(self, obj):
        value = obj.reviews.aggregate(
            average=Avg("rating")
        )["average"]

        return round(float(value), 1) if value is not None else 0

    def get_review_count(self, obj):
        return obj.reviews.count()

    def get_member_count(self, obj):
        return obj.donor_applications.filter(
            status=DonorCommunityApplication.Status.ACCEPTED
        ).count()


class CommunityReviewSerializer(serializers.ModelSerializer):
    donor_name = serializers.CharField(
        source="donor.full_name",
        read_only=True,
    )

    class Meta:
        model = CommunityReview
        fields = [
            "id",
            "donor_name",
            "rating",
            "review",
            "created_at",
            "updated_at",
        ]


class CommunityDetailSerializer(CommunityListSerializer):
    reviews = serializers.SerializerMethodField()
    address = serializers.CharField(read_only=True)
    pincode = serializers.CharField(read_only=True)
    latitude = serializers.FloatField(read_only=True)
    longitude = serializers.FloatField(read_only=True)

    class Meta(CommunityListSerializer.Meta):
        fields = CommunityListSerializer.Meta.fields + [
            "email",
            "mobile_number",
            "address",
            "pincode",
            "latitude",
            "longitude",
            "reviews",
        ]

    def get_reviews(self, obj):
        reviews = obj.reviews.select_related(
            "donor"
        )[:10]

        return CommunityReviewSerializer(
            reviews,
            many=True,
        ).data


class CommunityApplicationSerializer(serializers.ModelSerializer):
    community_name = serializers.CharField(
        source="community.name",
        read_only=True,
    )

    community_city = serializers.CharField(
        source="community.city",
        read_only=True,
    )

    community_state = serializers.CharField(
        source="community.state",
        read_only=True,
    )

    donor_name = serializers.CharField(
        source="donor.full_name",
        read_only=True,
    )

    donor_email = serializers.EmailField(
        source="donor.email",
        read_only=True,
    )

    donor_phone = serializers.CharField(
        source="donor.mobile_number",
        read_only=True,
    )

    blood_group = serializers.SerializerMethodField()

    verification_status = serializers.SerializerMethodField()

    required_documents_complete = serializers.SerializerMethodField()

    documents = serializers.SerializerMethodField()

    class Meta:
        model = DonorCommunityApplication
        fields = [
            "id",
            "donor",
            "donor_name",
            "donor_email",
            "donor_phone",
            "blood_group",
            "community",
            "community_name",
            "community_city",
            "community_state",
            "status",
            "submitted_at",
            "reviewed_at",
            "reviewed_by",
            "rejection_reason",
            "verification_status",
            "required_documents_complete",
            "documents",
        ]

        read_only_fields = fields

    def get_blood_group(self, obj):
        try:
            return obj.donor.donor_profile.blood_group
        except Exception:
            return None

    def get_verification_status(self, obj):
        try:
            application = obj.donor.verification_application
            return application.status
        except VerificationApplication.DoesNotExist:
            return None

    def get_required_documents_complete(self, obj):
        try:
            application = obj.donor.verification_application
        except VerificationApplication.DoesNotExist:
            return False

        required_types = {
            VerificationDocument.DocumentType.DONOR_IDENTITY,
            VerificationDocument.DocumentType.AGE_VERIFICATION,
            VerificationDocument.DocumentType.DONOR_DECLARATION,
        }

        documents = {
            document.document_type: document
            for document in application.documents.all()
        }

        return all(
            document_type in documents
            for document_type in required_types
        )

    def get_documents(self, obj):
        try:
            application = obj.donor.verification_application
        except VerificationApplication.DoesNotExist:
            return []

        required_types = [
            VerificationDocument.DocumentType.DONOR_IDENTITY,
            VerificationDocument.DocumentType.AGE_VERIFICATION,
            VerificationDocument.DocumentType.DONOR_DECLARATION,
        ]

        documents = {
            document.document_type: document
            for document in application.documents.all()
        }

        result = []

        for document_type in required_types:
            document = documents.get(document_type)

            result.append(
                {
                    "type": document_type,
                    "label": VerificationDocument(
                        document_type=document_type
                    ).get_document_type_display(),
                    "uploaded": document is not None,
                    "status": (
                        document.status
                        if document
                        else VerificationDocument.Status.PENDING
                    ),
                    "rejection_reason": (
                        document.rejection_reason
                        if document
                        else ""
                    ),
                    "id": (
                        str(document.id)
                        if document
                        else None
                    ),
                    "uploaded_at": (
                        document.uploaded_at
                        if document
                        else None
                    ),
                }
            )

        return result


class CommunityReviewCreateSerializer(serializers.ModelSerializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    review = serializers.CharField(max_length=2000, allow_blank=True, required=False)

    class Meta:
        model = CommunityReview
        fields = [
            "rating",
            "review",
        ]

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError(
                "Rating must be between 1 and 5."
            )

        return value


class CommunityProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Community
        fields = [
            "id",
            "name",
            "description",
            "logo",
            "email",
            "mobile_number",
            "address",
            "city",
            "state",
            "pincode",
            "latitude",
            "longitude",
            "is_active",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "is_active",
            "created_at",
            "updated_at",
        ]

    def validate_latitude(self, value):
        if value is not None and not -90 <= value <= 90:
            raise serializers.ValidationError(
                "Latitude must be between -90 and 90."
            )

        return value

    def validate_longitude(self, value):
        if value is not None and not -180 <= value <= 180:
            raise serializers.ValidationError(
                "Longitude must be between -180 and 180."
            )

        return value
